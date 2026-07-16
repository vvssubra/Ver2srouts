import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a strong, human-copyable temporary password: 14 chars,
// includes upper/lower/digit/symbol, avoids ambiguous glyphs.
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+?";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  // Guarantee at least one of each category by seeding the first 4 chars.
  const seeded = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  const rest = Array.from(bytes.slice(4)).map((n) => all[n % all.length]);
  const combined = [...seeded, ...rest];
  // Shuffle so the category-seeded chars don't cluster at the start.
  for (let i = combined.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Enforce super_admin only.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id } = await req.json().catch(() => ({}));
    if (!target_user_id || typeof target_user_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing target_user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetLookup, error: lookupErr } = await admin.auth.admin.getUserById(target_user_id);
    if (lookupErr || !targetLookup?.user) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetEmail = targetLookup.user.email ?? null;

    const tempPassword = generateTempPassword();

    const { error: updateErr } = await admin.auth.admin.updateUserById(target_user_id, {
      password: tempPassword,
    });
    if (updateErr) {
      console.error("updateUserById failed", updateErr);
      return new Response(JSON.stringify({ error: "Failed to reset password" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Force change on next login.
    await admin
      .from("profiles")
      .update({ must_change_password: true, password_changed_at: null } as any)
      .eq("id", target_user_id);

    // Audit log — captures who reset whose password and when.
    await admin.from("audit_logs").insert({
      actor_id: caller.id,
      action: "admin_generate_temp_password",
      target_type: "user",
      target_id: target_user_id,
      target_label: targetEmail,
      metadata: { method: "manual_temp_password" },
    } as any);

    return new Response(
      JSON.stringify({
        success: true,
        temp_password: tempPassword,
        email: targetEmail,
        must_change_password: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("admin-generate-temp-password error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});