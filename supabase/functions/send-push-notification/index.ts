import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Web Push delivery uses @negrel/webpush (RFC 8291 aes128gcm + RFC 8292 VAPID).
// The push payload is encrypted per-subscription using its p256dh+auth keys.

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Convert raw base64url VAPID keys (uncompressed P-256 public point + 32-byte
 * private scalar) into the JWK pair expected by @negrel/webpush.
 */
function vapidKeysToJwk(publicKeyB64Url: string, privateKeyB64Url: string) {
  const pub = base64UrlDecode(publicKeyB64Url);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error(`VAPID_PUBLIC_KEY must be 65-byte uncompressed P-256 point; got ${pub.length}`);
  }
  const x = base64UrlEncode(pub.slice(1, 33));
  const y = base64UrlEncode(pub.slice(33, 65));
  const d = base64UrlEncode(base64UrlDecode(privateKeyB64Url));

  return {
    publicKey: { kty: "EC", crv: "P-256", x, y, ext: true, key_ops: ["verify"] } as JsonWebKey,
    privateKey: { kty: "EC", crv: "P-256", x, y, d, ext: true, key_ops: ["sign"] } as JsonWebKey,
  };
}

// Cache the ApplicationServer between invocations on the same isolate.
let _appServerPromise: Promise<webpush.ApplicationServer> | null = null;
async function getAppServer(): Promise<webpush.ApplicationServer> {
  if (_appServerPromise) return _appServerPromise;
  _appServerPromise = (async () => {
    const pub = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const priv = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:balladeiva@gmail.com";
    const jwks = vapidKeysToJwk(pub, priv);
    const vapidKeys = await webpush.importVapidKeys(jwks);
    return await webpush.ApplicationServer.new({
      contactInformation: subject,
      vapidKeys,
    });
  })();
  return _appServerPromise;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Fast-path for DB-trigger / server-to-server calls. Accept either:
  //  1. Bearer token equal to SUPABASE_SERVICE_ROLE_KEY env (legacy key match)
  //  2. JWT whose payload role === "service_role" (decoded locally, no GoTrue
  //     round-trip — avoids 401s when getClaims rejects service-role JWTs).
  let __auth: { userId: string; email?: string | null; role?: string | null };
  {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let isServiceCaller = !!(token && serviceKeyEnv && token === serviceKeyEnv);

    if (!isServiceCaller && token) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
          const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
          const payload = JSON.parse(atob(padded + pad));
          if (payload?.role === "service_role") {
            isServiceCaller = true;
          }
        }
      } catch (_) {
        // ignore decode errors and fall through to requireAuth
      }
    }

    if (isServiceCaller) {
      __auth = { userId: "service_role", email: null, role: "service_role" };
    } else {
      const checked = await requireAuth(req, corsHeaders);
      if (checked instanceof Response) return checked;
      __auth = checked;
    }
  }

  try {
    const { user_id, title, message, type, url, badge, group_key, notification_id } = await req.json();

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "Missing user_id or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ============ Authorization ============
    // Allow:
    //  - service_role JWT (internal DB triggers / server-to-server)
    //  - caller sending to themselves (self-test)
    //  - super_admin: any user
    //  - franchisee/admin: only users inside their own branch
    // Block teachers/parents from notifying arbitrary users.
    const callerId = __auth.userId;
    const isService = __auth.role === "service_role" || callerId === "service_role";

    if (!isService && callerId !== user_id) {
      const { data: callerRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      if (rolesErr) {
        console.error("authz: failed to load caller roles", rolesErr);
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const roles = new Set((callerRoles ?? []).map((r: any) => r.role));
      const isSuperAdmin = roles.has("super_admin");
      const isBranchAdmin = roles.has("franchisee") || roles.has("admin");

      if (!isSuperAdmin && !isBranchAdmin) {
        return new Response(
          JSON.stringify({ error: "Not allowed to notify this user" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!isSuperAdmin) {
        // Find caller branches.
        const { data: callerBranches } = await supabase
          .from("branch_memberships")
          .select("branch_id")
          .eq("user_id", callerId);
        const callerBranchIds = new Set(
          (callerBranches ?? []).map((r: any) => r.branch_id).filter(Boolean),
        );
        if (callerBranchIds.size === 0) {
          return new Response(
            JSON.stringify({ error: "Not allowed to notify this user" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Target branches: direct membership OR via parent_students -> students.branch_id
        const { data: targetBranches } = await supabase
          .from("branch_memberships")
          .select("branch_id")
          .eq("user_id", user_id);
        const targetBranchIds = new Set(
          (targetBranches ?? []).map((r: any) => r.branch_id).filter(Boolean),
        );

        if (targetBranchIds.size === 0) {
          const { data: parentLinks } = await supabase
            .from("parent_students")
            .select("student_id")
            .eq("parent_id", user_id)
            .eq("status", "approved");
          const studentIds = (parentLinks ?? [])
            .map((r: any) => r.student_id)
            .filter(Boolean);
          if (studentIds.length > 0) {
            const { data: studs } = await supabase
              .from("students")
              .select("branch_id")
              .in("id", studentIds);
            for (const s of studs ?? []) {
              if ((s as any).branch_id) targetBranchIds.add((s as any).branch_id);
            }
          }
        }

        const overlap = [...targetBranchIds].some((b) => callerBranchIds.has(b));
        if (!overlap) {
          return new Response(
            JSON.stringify({ error: "Not allowed to notify this user" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }
    // ============ End authorization ============

    // Use the caller-provided URL when present (the DB trigger now forwards
    // NEW.action_url). Fall back to the most recent notification only when
    // nothing was passed in.
    let resolvedUrl: string | null = url ?? null;
    if (!resolvedUrl) {
      try {
        const { data: latest } = await supabase
          .from("notifications")
          .select("action_url")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedUrl = (latest as any)?.action_url ?? null;
      } catch {
        // best-effort
      }
    }

    // Compute unread count for the OS app badge
    let unreadBadge = typeof badge === "number" ? badge : 0;
    if (!unreadBadge) {
      try {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user_id)
          .eq("is_read", false);
        unreadBadge = count ?? 1;
      } catch {
        unreadBadge = 1;
      }
    }

    // Fetch push subscriptions for user
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch subscriptions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const logDelivery = async (entry: {
      endpoint?: string;
      status: string;
      response_code?: number | null;
      response_body?: string | null;
    }) => {
      try {
        await supabase.from("push_delivery_logs").insert({
          notification_id: notification_id ?? null,
          user_id,
          endpoint: entry.endpoint ?? null,
          status: entry.status,
          response_code: entry.response_code ?? null,
          response_body: entry.response_body ?? null,
        });
      } catch (e) {
        console.warn("push_delivery_logs insert failed", e);
      }
    };

    if (!subscriptions || subscriptions.length === 0) {
      await logDelivery({ status: "no_subscription" });
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payloadString = JSON.stringify({
      title,
      body: message,
      type: type || "general",
      url: resolvedUrl || "/",
      badge: unreadBadge,
      group_key: group_key ?? null,
      notification_id: notification_id ?? null,
    });

    let appServer: webpush.ApplicationServer;
    try {
      appServer = await getAppServer();
    } catch (err) {
      console.error("VAPID init failed:", err);
      await logDelivery({ status: "error", response_body: String((err as any)?.message ?? err).slice(0, 500) });
      return new Response(JSON.stringify({ error: "VAPID init failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    const expiredIds: string[] = [];

    for (const sub of subscriptions) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        } as PushSubscriptionJSON);

        // Web Push urgency/TTL improve Android heads-up delivery. Chat goes
        // out as `high` so Chrome/FCM is allowed to wake the device; other
        // notifications use `normal`. TTL is 24h so brief offline windows
        // still deliver when the device wakes.
        const isChat =
          type === "chat" || String(group_key || "").startsWith("chat:");
        await subscriber.pushTextMessage(payloadString, {
          urgency: isChat ? "high" : "normal",
          ttl: 86400,
        } as any);
        sent++;
        await logDelivery({ endpoint: sub.endpoint, status: "sent", response_code: 201 });
        try {
          await supabase
            .from("push_subscriptions")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", sub.id);
        } catch {}
      } catch (err) {
        const pushErr = err as { response?: Response; message?: string };
        const resp = pushErr?.response;
        if (resp && (resp.status === 404 || resp.status === 410)) {
          expiredIds.push(sub.id);
          await logDelivery({
            endpoint: sub.endpoint,
            status: "expired",
            response_code: resp.status,
          });
        } else if (resp) {
          let body = "";
          try { body = await resp.text(); } catch {}
          console.warn(`Push failed for ${sub.id}: ${resp.status} ${body}`);
          await logDelivery({
            endpoint: sub.endpoint,
            status: "failed",
            response_code: resp.status,
            response_body: body?.slice(0, 500),
          });
        } else {
          console.error(`Push error for ${sub.id}:`, err);
          await logDelivery({
            endpoint: sub.endpoint,
            status: "error",
            response_body: String(pushErr?.message ?? err).slice(0, 500),
          });
        }
      }
    }

    // Clean up expired subscriptions
    if (expiredIds.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    return new Response(JSON.stringify({ sent, expired: expiredIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push-notification error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
