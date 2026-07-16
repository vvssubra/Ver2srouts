import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getAppBaseUrl } from "../_shared/app-url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cron-scheduled. Finds chat messages that have been unread for >= 10 minutes
 * and sends a single "missed chat" email per (conversation, recipient) using
 * the earliest unread message id as an idempotency key — so retries and
 * later cron runs never duplicate sends. Once the recipient reads the thread,
 * no further emails are sent.
 *
 * Subject deliberately omits message content (privacy); body shows a short
 * preview only inside the email itself.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Publishable anon JWT — required because send-transactional-email uses
  // verify_jwt=true and rejects the new non-JWT service-role secret format.
  const ANON_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZWxua2FtZ2xlZnV6dGVtY3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODQ5NjIsImV4cCI6MjA4Nzg2MDk2Mn0.bz5Va4q7eYD8vZKSb7GIfS0LoKR7cvpurJN_c7QzlLQ";
  // Always prefer the hardcoded legacy JWT; the SUPABASE_ANON_KEY env may
  // contain the new non-JWT publishable secret which the gateway rejects.
  const envAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const anonKey = envAnon.startsWith("eyJ") ? envAnon : ANON_JWT;
  console.log("[send-missed-chat-emails] auth key source", {
    usingHardcoded: anonKey === ANON_JWT,
    envAnonPresent: !!envAnon,
    envAnonPrefix: envAnon.slice(0, 6),
  });
  const admin = createClient(supabaseUrl, serviceKey);
  const appBase = getAppBaseUrl();
  const startedAt = new Date().toISOString();
  console.log("[send-missed-chat-emails] start", { startedAt, appBase });

  try {
    const now = Date.now();
    const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();

    // Pull unread messages in the eligible window.
    const { data: unread, error } = await admin
      .from("chat_messages")
      .select("id, conversation_id, sender_id, text_body, created_at, read_at")
      .eq("is_read", false)
      .is("read_at", null)
      .lte("created_at", tenMinAgo)
      .gte("created_at", twoHoursAgo)
      .order("created_at", { ascending: true });
    if (error) throw error;
    console.log("[send-missed-chat-emails] unread candidates", {
      serverTimestamp: new Date().toISOString(),
      olderThan: tenMinAgo,
      newerThan: twoHoursAgo,
      totalUnreadOlderThan10m: unread?.length ?? 0,
      messageIds: (unread ?? []).map((m) => m.id),
    });
    if (!unread || unread.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group earliest unread per conversation.
    const earliestByConvo = new Map<string, { id: string; sender_id: string; text_body: string }>();
    const countByConvo = new Map<string, number>();
    for (const m of unread) {
      countByConvo.set(m.conversation_id, (countByConvo.get(m.conversation_id) ?? 0) + 1);
      if (!earliestByConvo.has(m.conversation_id)) {
        earliestByConvo.set(m.conversation_id, { id: m.id, sender_id: m.sender_id, text_body: m.text_body });
      }
    }

    const convoIds = [...earliestByConvo.keys()];
    const { data: convos } = await admin
      .from("conversations")
      .select("id, parent_id, subject, branch_id, students(first_name, last_name)")
      .in("id", convoIds);

    let staffToParentCandidates = 0;
    let parentToStaffCandidates = 0;
    for (const convo of convos ?? []) {
      const earliest = earliestByConvo.get(convo.id);
      if (!earliest) continue;
      if (earliest.sender_id === convo.parent_id) parentToStaffCandidates++;
      else staffToParentCandidates++;
    }
    console.log("[send-missed-chat-emails] candidates by direction", {
      conversations: convoIds.length,
      staffToParentCandidates,
      parentToStaffCandidates,
    });

    const { data: parts } = await admin
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convoIds);
    const partsByConvo = new Map<string, string[]>();
    for (const p of parts ?? []) {
      const arr = partsByConvo.get(p.conversation_id) ?? [];
      arr.push(p.user_id);
      partsByConvo.set(p.conversation_id, arr);
    }

    // Collect all user ids we may need profiles for (recipients + senders).
    const userIds = new Set<string>();
    for (const c of convos ?? []) if (c.parent_id) userIds.add(c.parent_id);
    for (const arr of partsByConvo.values()) for (const u of arr) userIds.add(u);
    for (const e of earliestByConvo.values()) userIds.add(e.sender_id);

    const { data: profilesRows } = await admin
      .from("profiles")
      .select("id, email, first_name, last_name")
      .in("id", [...userIds]);
    const profileMap = new Map<string, any>();
    for (const p of profilesRows ?? []) profileMap.set(p.id, p);

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const skipReasons: Record<string, number> = {};

    const recordSkip = (reason: string, extra: Record<string, unknown> = {}) => {
      skipped++;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      console.log(`[send-missed-chat-emails] skip: ${reason}`, extra);
    };
    let attempted = 0;

    for (const convo of convos ?? []) {
      const earliest = earliestByConvo.get(convo.id);
      if (!earliest) continue;
      const senderIsParent = earliest.sender_id === convo.parent_id;
      const recipientIds = senderIsParent
        ? (partsByConvo.get(convo.id) ?? []).filter((u) => u !== earliest.sender_id)
        : (convo.parent_id ? [convo.parent_id] : []);
      if (recipientIds.length === 0) {
        recordSkip("missing-recipient", { convoId: convo.id, messageId: earliest.id, senderIsParent });
        continue;
      }

      const sender = profileMap.get(earliest.sender_id);
      const senderName = sender
        ? `${sender.first_name ?? ""} ${sender.last_name ?? ""}`.trim() || "Sprouts"
        : (senderIsParent ? "A parent" : "School");
      const childName = (convo as any).students
        ? `${(convo as any).students.first_name ?? ""} ${(convo as any).students.last_name ?? ""}`.trim()
        : undefined;
      const messagePreview = (earliest.text_body || "").slice(0, 140);
      const messageCount = countByConvo.get(convo.id) ?? 1;
      const chatPath = senderIsParent
        ? `/staff-inbox?convo=${convo.id}`
        : `/parent-chat?convo=${convo.id}`;
      const chatUrl = `${appBase}${chatPath}`;

      for (const recipientId of recipientIds) {
        attempted++;
        const profile = profileMap.get(recipientId);
        if (!profile?.email) {
          recordSkip("missing-email", { recipientId, convoId: convo.id, messageId: earliest.id });
          continue;
        }

        // v2 key avoids legacy poisoned provider idempotency entries created
        // before send-transactional-email used a stable messageId in its body.
        const idempotencyKey = `chat-missed-v2-${earliest.id}-${recipientId}`;
        const { data: latestLog } = await admin
          .from("email_send_log")
          .select("status, error_message, created_at")
          .eq("message_id", idempotencyKey)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestLog?.status === "sent") {
          recordSkip("already-emailed", { recipientId, convoId: convo.id, messageId: earliest.id, createdAt: latestLog.created_at });
          continue;
        }

        try {
          // Direct fetch — supabase.functions.invoke inside an edge function
          // was failing silently (no logs reached send-transactional-email).
          // verify_jwt=true on send-transactional-email rejects the new
          // non-JWT service role secret format with INVALID_JWT_FORMAT.
          // The anon key is a valid JWT and is accepted.
          const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey || serviceKey}`,
              apikey: anonKey || serviceKey,
            },
            body: JSON.stringify({
              templateName: "chat-message-missed",
              recipientEmail: profile.email,
              idempotencyKey,
              messageId: idempotencyKey,
              templateData: {
                recipientName: profile.first_name ?? undefined,
                senderName,
                messagePreview,
                messageCount,
                chatUrl,
                branchName: childName ? `${childName}'s class` : "Sprouts",
              },
            }),
          });
          const respText = await resp.text();
          if (!resp.ok) {
            console.error("[send-missed-chat-emails] send-transactional-email failed", {
              status: resp.status, body: respText.slice(0, 500),
              recipientEmail: profile.email, convoId: convo.id, messageId: earliest.id, idempotencyKey,
            });
            failed++;
          } else {
            console.log("[send-missed-chat-emails] sent", {
              recipientEmail: profile.email, convoId: convo.id, messageId: earliest.id, idempotencyKey, body: respText.slice(0, 200),
            });
            sent++;
          }
        } catch (e) {
          console.error("send-missed-chat-emails: send failed", e);
          failed++;
        }
        // Throttle for Resend rate limits.
        await new Promise((r) => setTimeout(r, 350));
      }
    }

    console.log("[send-missed-chat-emails] completed", {
      conversations: convoIds.length, attempted, sent, skipped, failed, skipReasons,
    });
    return new Response(JSON.stringify({ ok: true, sent, skipped, failed, skipReasons, conversations: convoIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-missed-chat-emails error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});