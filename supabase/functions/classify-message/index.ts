import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;

  try {
    const { conversation_id, message_text } = await req.json();
    if (!conversation_id || !message_text) {
      return new Response(JSON.stringify({ error: "Missing conversation_id or message_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // === 1. Classify intent & sentiment ===
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an AI assistant for a preschool. Classify the parent message and translate it." },
          { role: "user", content: `Classify and translate this parent message:\n\n"${message_text}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_and_translate",
              description: "Classify a parent message by intent and sentiment, and translate it",
              parameters: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["leave", "concern", "academic", "billing", "general"],
                  },
                  sentiment: {
                    type: "string",
                    enum: ["positive", "neutral", "negative"],
                  },
                  translation_ms: {
                    type: "string",
                    description: "Translation to Bahasa Melayu",
                  },
                  translation_zh: {
                    type: "string",
                    description: "Translation to Mandarin Chinese",
                  },
                  translation_ta: {
                    type: "string",
                    description: "Translation to Tamil",
                  },
                },
                required: ["intent", "sentiment", "translation_ms", "translation_zh", "translation_ta"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_and_translate" } },
      }),
    });

    let intent = "general";
    let sentiment = "neutral";
    let translations: Record<string, string> = {};

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required for AI features." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", status, await aiResponse.text());
    } else {
      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const args = JSON.parse(toolCall.function.arguments);
        intent = args.intent || "general";
        sentiment = args.sentiment || "neutral";
        translations = {
          ms: args.translation_ms || "",
          zh: args.translation_zh || "",
          ta: args.translation_ta || "",
        };
      }
    }

    // === 2. Update conversation with AI tags ===
    const { data: convo, error: convoError } = await adminClient
      .from("conversations")
      .update({ ai_intent_tag: intent, ai_sentiment: sentiment })
      .eq("id", conversation_id)
      .select("*")
      .single();

    if (convoError) throw convoError;

    // === 3. Save translations to the first message ===
    if (Object.values(translations).some(t => t)) {
      const { data: firstMsg } = await adminClient
        .from("chat_messages")
        .select("id")
        .eq("conversation_id", conversation_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (firstMsg) {
        await adminClient
          .from("chat_messages")
          .update({ translated_text: translations })
          .eq("id", firstMsg.id);
      }
    }

    const branchId = convo.branch_id;

    // === 4. Get branch members for routing ===
    const { data: branchMembers } = await adminClient
      .from("branch_memberships")
      .select("user_id")
      .eq("branch_id", branchId);

    const memberIds = branchMembers?.map((m) => m.user_id) ?? [];

    const { data: memberRoles } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", memberIds);

    const franchisees = memberRoles?.filter((r) => r.role === "franchisee").map((r) => r.user_id) ?? [];
    const teachers = memberRoles?.filter((r) => r.role === "teacher").map((r) => r.user_id) ?? [];
    const superAdmins = memberRoles?.filter((r) => r.role === "super_admin").map((r) => r.user_id) ?? [];
    const admins = memberRoles?.filter((r) => r.role === "admin").map((r) => r.user_id) ?? [];
    const managers = [...franchisees, ...superAdmins, ...admins];

    // === 5. Determine participants based on intent ===
    let participants: string[] = [];
    if (intent === "billing") {
      participants = [...managers];
    } else if (intent === "concern") {
      participants = [...teachers, ...managers];
    } else {
      participants = [...teachers, ...managers];
    }

    if (participants.length === 0) {
      participants = [...managers];
    }
    participants = [...new Set(participants)];

    // === 6. Check quiet hours for teachers & escalate if needed ===
    if ((intent === "concern" || intent === "billing") && teachers.length > 0) {
      const { data: teacherProfiles } = await adminClient
        .from("profiles")
        .select("id, first_name, is_quiet_hours_enabled, quiet_hours_start, quiet_hours_end")
        .in("id", teachers);

      const now = new Date();
      const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

      for (const tp of (teacherProfiles ?? [])) {
        if (!tp.is_quiet_hours_enabled || !tp.quiet_hours_start || !tp.quiet_hours_end) continue;
        const start = (tp.quiet_hours_start as string).slice(0, 5);
        const end = (tp.quiet_hours_end as string).slice(0, 5);
        const inRange = start <= end
          ? currentTime >= start && currentTime < end
          : currentTime >= start || currentTime < end;

        if (inRange) {
          // Escalate: notify branch managers instead
          for (const fid of franchisees) {
            if (!participants.includes(fid)) participants.push(fid);
          }

          // Send escalation notification to managers
          const escalationNotifs = managers.map((uid) => ({
            user_id: uid,
            title: "⚠️ Escalated: Teacher in Quiet Hours",
            message: `A ${intent} message was received but teacher ${tp.first_name ?? ""} is in quiet hours. Please review.`,
            type: "escalation",
            reference_id: conversation_id,
            action_url: "/staff-inbox",
          }));
          if (escalationNotifs.length > 0) {
            await adminClient.from("notifications").insert(escalationNotifs);
          }
          break;
        }
      }
    }

    // === 7. Insert participants ===
    if (participants.length > 0) {
      const participantRows = participants.map((uid) => ({
        conversation_id,
        user_id: uid,
      }));
      await adminClient.from("conversation_participants").upsert(participantRows, {
        onConflict: "conversation_id,user_id",
      });
    }

    // === 8. Insert auto-reply message ===
    const autoReplyText =
      intent === "billing"
        ? "Thanks for reaching out! Your message has been routed to the branch manager for billing assistance."
        : intent === "concern"
        ? "Thanks for reaching out! Your message has been flagged and routed to both your child's teacher and branch manager."
        : "Thanks for reaching out! We've routed this to your child's teacher who will respond shortly.";

    await adminClient.from("chat_messages").insert({
      conversation_id,
      sender_id: convo.parent_id,
      text_body: autoReplyText,
      is_read: false,
    });

    // === 9. Notify assigned staff ===
    const notifications = participants.map((uid) => ({
      user_id: uid,
      title: "New Parent Message",
      message: `New ${intent} message from a parent: "${message_text.slice(0, 80)}${message_text.length > 80 ? "..." : ""}"`,
      type: "chat",
      reference_id: conversation_id,
      action_url: "/staff-inbox",
    }));
    if (notifications.length > 0) {
      await adminClient.from("notifications").insert(notifications);
    }

    return new Response(
      JSON.stringify({ success: true, intent, sentiment, participants_count: participants.length, translations_generated: Object.keys(translations).length > 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (e) {
    console.error("classify-message error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
