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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { submission_id, branch_id } = await req.json();

    if (!submission_id || !branch_id) {
      return new Response(JSON.stringify({ error: "Missing submission_id or branch_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch submission
    const { data: submission, error: subError } = await supabase
      .from("eform_submissions")
      .select("*, eforms(form_type, name)")
      .eq("id", submission_id)
      .single();

    if (subError || !submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = submission.submitted_data as Record<string, string>;
    const parentEmail = data.email || submission.recipient_email;
    const parentName = data.parent_name || submission.recipient_name;
    const childName = data.child_name || submission.child_name || "Child";
    const childDob = data.child_dob || null;

    if (!parentEmail) {
      return new Response(JSON.stringify({ error: "No email found in submission" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate password
    const generatedPassword = crypto.randomUUID().slice(0, 12);

    // Create parent user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: parentEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        first_name: parentName.split(" ")[0] || "",
        last_name: parentName.split(" ").slice(1).join(" ") || "",
      },
    });

    if (authError) {
      // If user already exists, that's fine
      if (!authError.message.includes("already been registered")) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const userId = authUser?.user?.id;

    if (userId) {
      // Assign parent role
      await supabase.from("user_roles").upsert(
        { user_id: userId, role: "parent" },
        { onConflict: "user_id,role" }
      );

      // Add branch membership
      await supabase.from("branch_memberships").upsert(
        { user_id: userId, branch_id },
        { onConflict: "user_id,branch_id" }
      );
    }

    // Create student record
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        branch_id,
        first_name: childName.split(" ")[0] || childName,
        last_name: childName.split(" ").slice(1).join(" ") || "",
        date_of_birth: childDob || null,
        parent_name: parentName,
        parent_email: parentEmail,
        parent_phone: data.phone || submission.recipient_phone || null,
        gender: data.child_gender?.toLowerCase() || null,
        medical_notes: data.allergies || null,
        emergency_contact_name: data.emergency_contact || null,
        emergency_contact_phone: data.emergency_phone || null,
        is_active: true,
      })
      .select("id")
      .single();

    if (studentError) {
      console.error("Student creation error:", studentError);
    }

    // Link parent to student
    if (userId && student) {
      await supabase.from("parent_students").upsert(
        {
          parent_id: userId,
          student_id: student.id,
          status: "approved",
          relation: "guardian",
          is_primary: true,
          created_via: "enrollment_form",
        },
        { onConflict: "parent_id,student_id" }
      );

      // Mark profile as needing password change and seed onboarding state
      await supabase
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", userId);

      await supabase
        .from("parent_onboarding_state")
        .upsert(
          { parent_id: userId, branch_id },
          { onConflict: "parent_id,branch_id", ignoreDuplicates: true }
        );
    }

    // Update submission status
    await supabase
      .from("eform_submissions")
      .update({ status: "approved" })
      .eq("id", submission_id);

    // Send welcome-kit email via the unified transactional email registry.
    // Reuses the same template/path as provision-parent-account so there is
    // only one parent-onboarding email pipeline in the system.
    try {
      const appUrl =
        Deno.env.get("APP_PUBLIC_URL") ??
        "https://sprouts.littlegreenhearts.com";

      const [{ data: branch }, { data: settings }, { data: requiredDocs }] =
        await Promise.all([
          supabase.from("branches").select("name").eq("id", branch_id).maybeSingle(),
          supabase.from("email_global_settings").select("welcome_kit_url").maybeSingle(),
          supabase
            .from("school_documents")
            .select("title, file_url")
            .eq("branch_id", branch_id)
            .eq("is_active", true)
            .eq("is_required_for_onboarding", true)
            .order("display_order", { ascending: true }),
        ]);

      const idempotencyKey = `parent-welcome-${userId}-${student?.id}-${submission_id}`;

      const { error: dispatchErr } = await supabase.rpc(
        "dispatch_transactional_email",
        {
          _template_name: "parent-welcome-kit",
          _recipient_email: parentEmail,
          _template_data: {
            parentName,
            childName,
            branchName: branch?.name ?? "Sprouts",
            welcomeKitUrl: settings?.welcome_kit_url ?? undefined,
            appUrl,
            loginEmail: parentEmail,
            tempPassword: generatedPassword,
            loginUrl: `${appUrl}/auth`,
            attachedDocuments: (requiredDocs ?? []).map((d: any) => ({
              title: d.title,
              url: d.file_url,
            })),
          },
          _idempotency_key: idempotencyKey,
        }
      );

      if (dispatchErr) {
        console.error("dispatch_transactional_email error:", dispatchErr);
      } else if (userId) {
        await supabase
          .from("parent_welcome_email_sent")
          .upsert(
            { parent_user_id: userId, sent_at: new Date().toISOString() },
            { onConflict: "parent_user_id" }
          );
      }
    } catch (emailErr) {
      console.error("Email error:", emailErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        student_id: student?.id,
        user_id: userId,
        message: "Enrollment processed successfully",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Process enrollment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
