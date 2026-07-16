import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Fan out a "your app icon was updated" web push to every user that has an
 * active push subscription. Triggered by a database trigger after the
 * organization_branding row is updated, or callable manually by admins.
 *
 * Body: { variant: "parents" | "teachers", app_name?: string }
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __auth = await requireAuth(req, corsHeaders);
  if (__auth instanceof Response) return __auth;

  try {
    const { variant = "parents", app_name } = await req.json().catch(() => ({}));
    const isParent = variant === "parents";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Pull recipients. We scope by role: parents get the parents-app icon
    // notice, staff get the teachers-app one. If user_roles is missing for
    // some users we still send (graceful default).
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("user_id");
    if (subsErr) throw subsErr;
    const userIds = Array.from(
      new Set((subs ?? []).map((r) => r.user_id).filter(Boolean) as string[])
    );

    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "no subscribers" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);
    const parentIds = new Set(
      (roles ?? [])
        .filter((r: any) => r.role === "parent")
        .map((r: any) => r.user_id)
    );
    const targets = isParent
      ? userIds.filter((id) => parentIds.has(id))
      : userIds.filter((id) => !parentIds.has(id));

    const title = "We updated our app icon";
    const message = `Tap to refresh ${app_name ?? (isParent ? "Sprouts Parents" : "Sprouts Staff")} on your home screen.`;
    const url = isParent ? "/install/parents" : "/install/teachers";

    let sent = 0;
    let failed = 0;

    // Fan out via the existing send-push-notification function. Sequential is
    // fine for org-scale (hundreds of users); upgrade to batched parallel
    // later if needed.
    for (const user_id of targets) {
      try {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-push-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id,
              title,
              message,
              type: "branding_update",
              url,
            }),
          }
        );
        if (res.ok) sent++;
        else failed++;
      } catch (e) {
        console.error("branding push failed for", user_id, e);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed, total: targets.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("broadcast-branding-update error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});