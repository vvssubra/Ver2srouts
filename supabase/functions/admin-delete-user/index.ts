import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const actorId = claimsData.claims.sub;

    // Verify actor is super_admin
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actorId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Forbidden: super_admin required" }), { status: 403, headers: corsHeaders });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: "target_user_id required" }), { status: 400, headers: corsHeaders });
    }

    if (target_user_id === actorId) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), { status: 400, headers: corsHeaders });
    }

    // Get target user info for audit log
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("id", target_user_id)
      .maybeSingle();

    const targetLabel = targetProfile
      ? `${targetProfile.first_name || ""} ${targetProfile.last_name || ""} (${targetProfile.email})`.trim()
      : target_user_id;

    // Cascade delete from public tables
    const tables = [
      { table: "notification_preferences", column: "user_id" },
      { table: "notifications", column: "user_id" },
      { table: "access_group_members", column: "user_id" },
      { table: "conversation_participants", column: "user_id" },
      { table: "branch_memberships", column: "user_id" },
      { table: "user_roles", column: "user_id" },
      { table: "profiles", column: "id" },
    ];

    const deletedCounts: Record<string, number> = {};
    for (const { table, column } of tables) {
      const { data, error } = await adminClient
        .from(table)
        .delete()
        .eq(column, target_user_id)
        .select("id");
      if (error) {
        console.error(`Error deleting from ${table}:`, error.message);
      }
      deletedCounts[table] = data?.length ?? 0;
    }

    // Delete from auth.users
    const { error: authError } = await adminClient.auth.admin.deleteUser(target_user_id);
    if (authError) {
      console.error("Error deleting auth user:", authError.message);
      return new Response(JSON.stringify({ error: `Auth deletion failed: ${authError.message}` }), { status: 500, headers: corsHeaders });
    }

    // Log audit entry (using admin client since profile is deleted)
    await adminClient.from("audit_logs").insert({
      actor_id: actorId,
      action: "delete_user",
      target_type: "user",
      target_id: target_user_id,
      target_label: targetLabel,
      metadata: { deleted_counts: deletedCounts },
    });

    return new Response(JSON.stringify({ success: true, deleted_counts: deletedCounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
