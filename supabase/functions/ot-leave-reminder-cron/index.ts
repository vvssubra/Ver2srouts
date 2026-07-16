// Bi-weekly reminder cron: sends in-system + email reminders to all active
// staff to update their OT and Leave records. Gated by reminder_settings.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Load settings
  const { data: settings } = await admin
    .from("reminder_settings")
    .select("*")
    .eq("kind", "ot_leave")
    .maybeSingle();

  if (!settings || !settings.enabled) {
    return new Response(JSON.stringify({ skipped: "disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date();
  const last = settings.last_sent_at ? new Date(settings.last_sent_at) : null;
  const intervalMs = settings.frequency_weeks * 7 * 24 * 60 * 60 * 1000;
  if (last && now.getTime() - last.getTime() < intervalMs - 60 * 60 * 1000) {
    return new Response(JSON.stringify({ skipped: "too_soon" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find active staff (anyone with role 'staff' or 'admin' or 'super_admin')
  const { data: roles } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["staff", "admin", "super_admin"]);
  const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id))).filter(Boolean);
  if (!userIds.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", userIds);

  // In-app notifications (bulk)
  const notifRows = userIds.map((uid) => ({
    user_id: uid,
    title: "OT & Leave Reminder",
    message:
      "Please review your Overtime (OT) and Leave records. If you have worked overtime or taken leave but have not submitted your application in Sprouts, please update your records to ensure accurate payroll processing.",
    type: "reminder",
    action_url: "/overtime",
    group_key: `ot-leave-reminder-${now.toISOString().slice(0, 10)}`,
    priority: "normal",
  }));
  await admin.from("notifications").insert(notifRows);

  // Emails (throttled)
  let sent = 0;
  for (const p of profiles ?? []) {
    if (!p.email) continue;
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "ot-leave-reminder",
          recipientEmail: p.email,
          idempotencyKey: `ot-leave-reminder-${p.id}-${now.toISOString().slice(0, 10)}`,
          templateData: { staffName: p.first_name || undefined },
        },
      });
      sent++;
    } catch {
      // best-effort
    }
    await new Promise((r) => setTimeout(r, 550));
  }

  await admin
    .from("reminder_settings")
    .update({ last_sent_at: now.toISOString() })
    .eq("kind", "ot_leave");

  return new Response(JSON.stringify({ sent, total: userIds.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});