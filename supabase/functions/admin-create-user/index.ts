import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller
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
    const { data: callerAuth, error: authError } = await callerClient.auth.getUser();
    if (authError || !callerAuth?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const caller = callerAuth.user;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller's role
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: no role assigned" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, first_name, last_name, role, branch_id, password, phone, link_student_id } = body;

    if (!email || !first_name || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, first_name, role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Permission checks
    const cRole = callerRole.role;
    if (cRole === "super_admin") {
      // Super admin can create any role — no restriction
      // Branch membership check is skipped for super_admin
    } else if (cRole === "franchisee" || cRole === "admin") {
      // Can create teacher, admin, parent within their branch
      if (!["teacher", "staff", "admin", "parent"].includes(role)) {
        return new Response(JSON.stringify({ error: "You can only create Teacher, Non-Teaching Staff, Admin, or Parent accounts." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!branch_id) {
        return new Response(JSON.stringify({ error: "Branch ID is required for creating staff/parent accounts." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify caller belongs to this branch
      const { data: membership } = await adminClient
        .from("branch_memberships")
        .select("id")
        .eq("user_id", caller.id)
        .eq("branch_id", branch_id)
        .single();
      if (!membership) {
        return new Response(JSON.stringify({ error: "You can only create users within your own branch." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Forbidden: insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate password if not provided
    const tempPassword = password || crypto.randomUUID().slice(0, 12) + "A1!";

    // Create user via admin API
    const normalizedEmail = email.trim().toLowerCase();
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: first_name.trim(),
        last_name: (last_name || "").trim(),
      },
    });

    let newUserId: string;
    let reusedExisting = false;

    if (createError) {
      const alreadyExists =
        createError.message?.includes("already been registered") ||
        createError.message?.includes("already exists");
      if (!alreadyExists) throw createError;

      // Look up the existing user by email and reuse it (idempotent provisioning)
      let existingId: string | undefined;
      for (let page = 1; page <= 10 && !existingId; page++) {
        const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) throw listErr;
        existingId = list.users.find(
          (u) => u.email?.toLowerCase() === normalizedEmail,
        )?.id;
        if (!list.users.length || list.users.length < 200) break;
      }
      if (!existingId) {
        return new Response(
          JSON.stringify({ error: "A user with this email already exists but could not be found." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      newUserId = existingId;
      reusedExisting = true;
    } else {
      newUserId = newUserData.user.id;
    }

    // Insert role (upsert to be idempotent for existing users)
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: newUserId, role }, { onConflict: "user_id,role" });
    if (roleError) {
      console.error("Role insert error:", roleError);
    }

    // Insert branch membership if branch_id provided
    if (branch_id) {
      const { error: membershipError } = await adminClient
        .from("branch_memberships")
        .upsert(
          { user_id: newUserId, branch_id },
          { onConflict: "user_id,branch_id" },
        );
      if (membershipError) {
        console.error("Membership insert error:", membershipError);
      }
    }

    // Update profile with phone if provided
    if (phone) {
      await adminClient
        .from("profiles")
        .update({ phone })
        .eq("id", newUserId);
    }

    // Mark account as requiring password change on first login
    await adminClient
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", newUserId);

    // If creating a parent and link_student_id is provided, auto-link
    if (role === "parent" && link_student_id) {
      const { error: linkError } = await adminClient
        .from("parent_students")
        .upsert(
          { parent_id: newUserId, student_id: link_student_id },
          { onConflict: "parent_id,student_id" },
        );
      if (linkError) {
        console.error("Parent-student link error:", linkError);
      }
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: caller.id,
      action: reusedExisting ? "link_existing_user" : "create_user",
      target_type: "user",
      target_id: newUserId,
      target_label: normalizedEmail,
      metadata: { role, branch_id, created_by: cRole, reused_existing: reusedExisting },
    });

    // Send staff welcome email (non-parent roles only; only for newly created users)
    if (!reusedExisting && role !== "parent") {
      try {
        let branchName: string | undefined;
        if (branch_id) {
          const { data: br } = await adminClient
            .from("branches")
            .select("name")
            .eq("id", branch_id)
            .maybeSingle();
          branchName = br?.name;
        }
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            templateName: "staff-welcome",
            recipientEmail: normalizedEmail,
            branchId: branch_id ?? null,
            idempotencyKey: `staff-welcome-${newUserId}`,
            templateData: {
              staffName: first_name?.trim() || "",
              email: normalizedEmail,
              temporaryPassword: tempPassword,
              role,
              branchName,
            },
          }),
        });
      } catch (emailErr) {
        console.error("Failed to send staff welcome email:", emailErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: newUserId,
      email: normalizedEmail,
      temporary_password: reusedExisting ? null : tempPassword,
      reused_existing: reusedExisting,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-create-user error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
