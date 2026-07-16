import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

  const auth = await requireAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const { email, studentName, branchName, branchId, accessCode } = await req.json();

    if (!email || !branchId || !accessCode) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, branchId, accessCode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: callerRoles, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId);

    if (roleError) throw roleError;

    const roles = new Set((callerRoles ?? []).map((r: any) => r.role));
    const isSuperAdmin = roles.has("super_admin");
    const isBranchAdmin = roles.has("franchisee") || roles.has("admin");

    if (!isSuperAdmin && !isBranchAdmin) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isSuperAdmin) {
      const { data: membership, error: membershipError } = await adminClient
        .from("branch_memberships")
        .select("id")
        .eq("user_id", auth.userId)
        .eq("branch_id", branchId)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden for this branch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const baseUrl = (Deno.env.get("APP_PUBLIC_URL") ||
      Deno.env.get("APP_BASE_URL") ||
      "https://sprouts.littlegreenhearts.com").replace(/\/+$/, "");

    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("Authorization") ?? "",
      },
      body: JSON.stringify({
        type: "parent_invite",
        to: email,
        branchId,
        data: {
          studentName,
          branchName,
          accessCode,
          inviteUrl: `${baseUrl}/auth?accessCode=${accessCode}`,
        },
      }),
    });

    const result = await response.json().catch(() => ({ success: false }));

    return new Response(
      JSON.stringify({
        success: !!result.success,
        message: result.success ? `Invitation email sent to ${email}` : "Invitation email could not be sent",
      }),
      { status: response.ok ? 200 : response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Error sending invite:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? "Failed to send invite" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
