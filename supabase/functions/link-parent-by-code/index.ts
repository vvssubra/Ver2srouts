import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);

    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string | undefined;

    const payload = await req.json().catch(() => ({}));
    const accessCode = payload?.access_code ?? payload?.accessCode;

    if (!accessCode || typeof accessCode !== "string") {
      return new Response(JSON.stringify({ error: "access_code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // NOTE: staff/teacher accounts may also be parents (their own child enrolled).
    // We do NOT block linking based on existing non-parent roles — we simply
    // add the parent role alongside. Auth.tsx routes multi-role users through
    // /select-role so both panels remain accessible.

    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("id, branch_id")
      .eq("student_access_code", accessCode)
      .single();

    if (studentErr || !student) {
      return new Response(JSON.stringify({ error: "Invalid access code" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingLink, error: linkLookupErr } = await supabase
      .from("parent_students")
      .select("id")
      .eq("parent_id", userId)
      .eq("student_id", student.id)
      .maybeSingle();

    if (linkLookupErr) throw linkLookupErr;

    if (!existingLink) {
      const { error: linkInsertErr } = await supabase.from("parent_students").insert({
        parent_id: userId,
        student_id: student.id,
        status: "approved",
      });
      if (linkInsertErr) throw linkInsertErr;
    }

    // Upsert the parent role without touching any existing staff/teacher rows.
    // The user_roles table has a UNIQUE (user_id, role) constraint, so this is
    // safe for accounts that already hold the parent role.
    const { error: roleUpsertErr } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "parent" },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (roleUpsertErr) throw roleUpsertErr;

    // NOTE: Parents are NOT added to branch_memberships.
    // Parents are external to the organization. Their branch context is derived
    // from the students they're linked to via parent_students.

    if (userEmail) {
      const { error: invitationUpdateErr } = await supabase
        .from("parent_invitations")
        .update({ status: "accepted" })
        .eq("email", userEmail)
        .eq("student_id", student.id)
        .eq("status", "pending");

      if (invitationUpdateErr) throw invitationUpdateErr;
    }

    // Send welcome kit email (dedupe per parent).
    try {
      const { data: alreadySent } = await supabase
        .from("parent_welcome_email_sent")
        .select("parent_user_id")
        .eq("parent_user_id", userId)
        .maybeSingle();

      if (!alreadySent && userEmail) {
        const { data: studentRow } = await supabase
          .from("students")
          .select("first_name, last_name, branches:branch_id(name)")
          .eq("id", student.id)
          .maybeSingle();

        const { data: parentProfile } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", userId)
          .maybeSingle();

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "parent-welcome-kit",
            recipientEmail: userEmail,
            idempotencyKey: `welcome-kit-${userId}`,
            templateData: {
              parentName: parentProfile?.first_name ?? undefined,
              childName: studentRow?.first_name ?? undefined,
              branchName: (studentRow as any)?.branches?.name ?? undefined,
            },
          },
        });

        await supabase
          .from("parent_welcome_email_sent")
          .insert({ parent_user_id: userId });
      }
    } catch (welcomeErr) {
      // Non-fatal — log and continue
      console.error("welcome email dispatch failed:", welcomeErr);
    }

    return new Response(JSON.stringify({ success: true, student_id: student.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("link-parent-by-code error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
