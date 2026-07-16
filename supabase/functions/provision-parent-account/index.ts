import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL =
  Deno.env.get("APP_PUBLIC_URL") ?? "https://sprouts.littlegreenhearts.com";

function generateTempPassword(): string {
  // 12 chars, mixed case + digit + symbol — easy to copy from email
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  const bytes = new Uint8Array(11);
  crypto.getRandomValues(bytes);
  let pwd = "";
  for (const b of bytes) pwd += chars[b % chars.length];
  pwd += symbols[Math.floor(Math.random() * symbols.length)];
  return pwd;
}

interface Body {
  student_id: string;
  branch_id: string;
  relation: "mother" | "father" | "guardian" | "other";
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  ic_number?: string;
  occupation?: string;
  is_primary?: boolean;
  send_email?: boolean; // default true
  /** When true, always rotate password (used by "Reset password" / "Resend welcome"). */
  reset_password?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const {
    student_id,
    branch_id,
    relation,
    email,
    first_name,
    last_name,
    phone,
    ic_number,
    occupation,
    is_primary = false,
    send_email = true,
    reset_password = false,
  } = body ?? {};

  if (!student_id || !branch_id || !relation || !email) {
    return new Response(
      JSON.stringify({
        error: "student_id, branch_id, relation, and email are required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return new Response(JSON.stringify({ error: "Invalid email" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Authorization: caller must be super_admin, or an admin/franchisee/teacher/staff
  // with membership in the target branch. Prevents any authenticated user
  // (including parents) from linking themselves as an approved parent of any child.
  try {
    if (auth.role !== "service_role") {
      const callerId = auth.userId;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      const isSuper = roleSet.has("super_admin");
      const isStaff =
        roleSet.has("admin") ||
        roleSet.has("franchisee") ||
        roleSet.has("teacher") ||
        roleSet.has("staff");

      if (!isSuper) {
        if (!isStaff) {
          return new Response(
            JSON.stringify({ error: "Forbidden: staff role required" }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        const { data: membership } = await supabase
          .from("branch_memberships")
          .select("id")
          .eq("user_id", callerId)
          .eq("branch_id", branch_id)
          .maybeSingle();
        if (!membership) {
          return new Response(
            JSON.stringify({
              error: "Forbidden: you are not a member of this branch",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        // Confirm the student actually belongs to that branch, so a branch
        // member cannot provision a parent for a student in another branch.
        const { data: student } = await supabase
          .from("students")
          .select("id, branch_id")
          .eq("id", student_id)
          .maybeSingle();
        if (!student || student.branch_id !== branch_id) {
          return new Response(
            JSON.stringify({
              error: "Forbidden: student does not belong to this branch",
            }),
            {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      }
    }
  } catch (authzErr) {
    console.error("provision-parent-account authz error:", authzErr);
    return new Response(JSON.stringify({ error: "Authorization check failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Find or create the auth user
    let userId: string | null = null;
    let tempPassword: string | null = null;
    let wasCreated = false;

    // Look up existing profile by email first (cheapest)
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      userId = existingProfile.id;
      if (reset_password) {
        tempPassword = generateTempPassword();
        const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
          password: tempPassword,
        });
        if (updErr) throw updErr;
        await supabase
          .from("profiles")
          .update({ must_change_password: true })
          .eq("id", userId);
      }
    } else {
      tempPassword = generateTempPassword();
      const { data: created, error: createErr } =
        await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            first_name: first_name ?? "",
            last_name: last_name ?? "",
            phone: phone ?? "",
          },
        });

      if (createErr) {
        // Race: user was just created elsewhere; look it up
        if (/already/i.test(createErr.message)) {
          const { data: list } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 1,
          });
          // Fall back: query profiles again after a short delay
          const { data: again } = await supabase
            .from("profiles")
            .select("id")
            .ilike("email", normalizedEmail)
            .maybeSingle();
          userId = again?.id ?? null;
          tempPassword = null; // can't share an unknown password
        } else {
          throw createErr;
        }
      } else {
        userId = created?.user?.id ?? null;
        wasCreated = true;
      }
    }

    if (!userId) {
      throw new Error("Could not create or find parent user");
    }

    // 2. Upsert profile fields + must_change_password flag (only if newly created)
    await supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: normalizedEmail,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          phone: phone ?? null,
          must_change_password: wasCreated ? true : undefined,
        },
        { onConflict: "id" }
      );

    // 3. Assign parent role (idempotent)
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: "parent" }, { onConflict: "user_id,role" });

    // 4. Branch membership
    await supabase
      .from("branch_memberships")
      .upsert(
        { user_id: userId, branch_id },
        { onConflict: "user_id,branch_id" }
      );

    // 5. Link parent ↔ student (with relation)
    const { error: linkErr } = await supabase
      .from("parent_students")
      .upsert(
        {
          parent_id: userId,
          student_id,
          status: "approved",
          relation,
          is_primary,
          created_via: "auto_provision",
        },
        { onConflict: "parent_id,student_id" }
      );
    if (linkErr) throw linkErr;

    // 5b. Mirror denormalized name / IC / phone / occupation onto students row
    //     so the existing Profile tab keeps working unchanged.
    if (relation === "mother" || relation === "father") {
      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim();
      const updates: Record<string, any> = {};
      if (fullName) updates[`${relation}_name`] = fullName;
      if (phone) updates[`${relation}_phone`] = phone;
      if (ic_number) updates[`${relation}_ic`] = ic_number;
      if (occupation) updates[`${relation}_occupation`] = occupation;
      if (Object.keys(updates).length) {
        await supabase.from("students").update(updates).eq("id", student_id);
      }
    }

    // 6. Seed onboarding state row
    await supabase
      .from("parent_onboarding_state")
      .upsert(
        { parent_id: userId, branch_id },
        { onConflict: "parent_id,branch_id", ignoreDuplicates: true }
      );

    // 7. Send the welcome-kit email (only if we know the temp password)
    let emailQueued = false;
    if (send_email && tempPassword) {
      // Look up child name + branch name + welcome kit url
      const [{ data: student }, { data: branch }, { data: settings }] =
        await Promise.all([
          supabase
            .from("students")
            .select("first_name, last_name")
            .eq("id", student_id)
            .maybeSingle(),
          supabase
            .from("branches")
            .select("name")
            .eq("id", branch_id)
            .maybeSingle(),
          supabase
            .from("email_global_settings")
            .select("welcome_kit_url")
            .maybeSingle(),
        ]);

      // Required onboarding documents to attach
      const { data: requiredDocs } = await supabase
        .from("school_documents")
        .select("title, file_url")
        .eq("branch_id", branch_id)
        .eq("is_active", true)
        .eq("is_required_for_onboarding", true)
        .order("display_order", { ascending: true });

      const childName =
        [student?.first_name, student?.last_name].filter(Boolean).join(" ") ||
        "your child";

      const parentName =
        [first_name, last_name].filter(Boolean).join(" ") || undefined;

      const idempotencyKey = `parent-welcome-${userId}-${student_id}-${Date.now()}`;

      const { error: dispatchErr } = await supabase.rpc(
        "dispatch_transactional_email",
        {
          _template_name: "parent-welcome-kit",
          _recipient_email: normalizedEmail,
          _template_data: {
            parentName,
            childName,
            branchName: branch?.name ?? "Sprouts",
            welcomeKitUrl: settings?.welcome_kit_url ?? undefined,
            appUrl: APP_URL,
            loginEmail: normalizedEmail,
            tempPassword,
            loginUrl: `${APP_URL}/auth`,
            attachedDocuments: (requiredDocs ?? []).map((d: any) => ({
              title: d.title,
              url: d.file_url,
            })),
          },
          _idempotency_key: idempotencyKey,
        }
      );

      if (dispatchErr) {
        console.error("dispatch_transactional_email error", dispatchErr);
      } else {
        emailQueued = true;
        await supabase
          .from("parent_welcome_email_sent")
          .upsert(
            { parent_user_id: userId, sent_at: new Date().toISOString() },
            { onConflict: "parent_user_id" }
          );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        created: wasCreated,
        email_queued: emailQueued,
        temp_password_set: Boolean(tempPassword),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("provision-parent-account error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});