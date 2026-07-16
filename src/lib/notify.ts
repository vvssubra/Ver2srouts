import { supabase } from "@/integrations/supabase/client";

/**
 * Supported HR workflows for routed approvals.
 * Must stay in sync with the `approval_routing.workflow` check + `resolve_approvers` RPC.
 */
export type ApprovalWorkflow = "leave" | "ot" | "claim" | "payroll" | "attendance";

/** Insert notifications for multiple users (fire-and-forget, never throws) */
export async function notifyUsers(
  userIds: string[],
  title: string,
  message: string,
  type: string,
  referenceId?: string,
  actionUrl?: string,
  groupKey?: string,
  priority: string = "normal"
) {
  if (!userIds.length) return;
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title,
    message,
    type,
    reference_id: referenceId ?? null,
    action_url: actionUrl ?? null,
    group_key: groupKey ?? null,
    priority,
  }));
  try {
    await supabase.from("notifications").insert(rows);
  } catch {
    // best-effort
  }
}

/**
 * Resolve email addresses for a list of user IDs.
 * Tries `profiles.email` first, falls back to user metadata via admin lookup not available client-side.
 */
export async function getUserEmails(userIds: string[]): Promise<Array<{ id: string; email: string; first_name?: string | null; last_name?: string | null }>> {
  if (!userIds.length) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name")
    .in("id", userIds);
  return ((data ?? []) as any[]).filter((p) => !!p.email);
}

/**
 * Fire-and-forget transactional email send to one or more recipients.
 * Calls `send-transactional-email` per recipient. Never throws.
 * If the workspace has no email domain configured, the function will return
 * a 403 which is swallowed silently so in-app notifications still succeed.
 */
export async function sendTemplateEmail(
  recipientUserIds: string[],
  templateName: string,
  buildTemplateData: (recipient: { id: string; email: string; first_name?: string | null; last_name?: string | null }) => Record<string, any>,
  idempotencyKeyPrefix: string
) {
  try {
    const recipients = await getUserEmails(recipientUserIds);
    // Throttle to stay under Resend's 2 req/sec free-tier rate limit.
    // Sequential with ~600ms gap is safe and keeps approval flows reliable.
    for (const r of recipients) {
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName,
            recipientEmail: r.email,
            idempotencyKey: `${idempotencyKeyPrefix}-${r.id}`,
            templateData: buildTemplateData(r),
          },
        });
      } catch {
        // best-effort per recipient
      }
      if (recipients.length > 1) {
        await new Promise((res) => setTimeout(res, 600));
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Combined helper: notifies in-app + emails approvers for a workflow submission.
 * Resolves approvers via `resolve_approvers` RPC, sends `approval-pending` email
 * to each (l1, l2, notify_submit), and falls back to branch approvers if none.
 */
export async function notifyAndEmailWorkflowApprovers(args: {
  submitterUserId: string;
  branchId: string;
  workflow: ApprovalWorkflow;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  referenceId?: string;
  groupKey?: string;
  priority?: string;
  // Email payload
  requesterName: string;
  requestType: string;       // "Leave" | "Overtime" | "Claim" | "Payroll" | "Attendance alert"
  summary?: string;
  details?: Array<{ label: string; value: string }>;
  companyName?: string;
  inboxUrl?: string;
  emailIdempotencyKey: string;
}) {
  const recipientIds = new Set<string>();
  try {
    const { data } = await supabase.rpc("resolve_approvers", {
      _user_id: args.submitterUserId,
      _workflow: args.workflow,
    });
    const row: any = Array.isArray(data) ? data[0] : data;
    if (row) {
      if (row.l1_approver) recipientIds.add(row.l1_approver);
      if (row.l2_approver) recipientIds.add(row.l2_approver);
      for (const u of (row.notify_submit ?? []) as string[]) {
        if (u) recipientIds.add(u);
      }
    }
  } catch {
    // ignored
  }
  recipientIds.delete(args.submitterUserId);

  // Fallback to branch-wide approvers if routing returned nothing
  if (recipientIds.size === 0) {
    try {
      const ids = await getBranchManagerIds(args.branchId);
      for (const id of ids) if (id !== args.submitterUserId) recipientIds.add(id);
    } catch {
      // ignored
    }
  }

  const list = Array.from(recipientIds);
  if (list.length === 0) return;

  // In-app
  await notifyUsers(
    list,
    args.title,
    args.message,
    args.type,
    args.referenceId,
    args.actionUrl,
    args.groupKey,
    args.priority ?? "high"
  );

  // Email
  await sendTemplateEmail(
    list,
    "approval-pending",
    (r) => ({
      approverName: r.first_name || undefined,
      requesterName: args.requesterName,
      requestType: args.requestType,
      summary: args.summary,
      details: args.details ?? [],
      companyName: args.companyName,
      inboxUrl: args.inboxUrl,
    }),
    args.emailIdempotencyKey
  );
}

/**
 * Notify + email the submitter when a request is approved/rejected.
 * In-app notification is always inserted; email is best-effort.
 */
export async function notifyAndEmailSubmitterDecision(args: {
  submitterUserId: string;
  title: string;
  message: string;
  type: string;
  actionUrl?: string;
  referenceId?: string;
  templateName: string;        // e.g., "leave-status" | "ot-request-status" | "claim-status" | "payslip-published"
  templateData: Record<string, any>;
  emailIdempotencyKey: string;
}) {
  await notifyUsers(
    [args.submitterUserId],
    args.title,
    args.message,
    args.type,
    args.referenceId,
    args.actionUrl
  );
  await sendTemplateEmail(
    [args.submitterUserId],
    args.templateName,
    (r) => ({
      staffName: r.first_name || undefined,
      ...args.templateData,
    }),
    args.emailIdempotencyKey
  );
}

/**
 * Notify all branch approvers (franchisee, admin, super_admin) via the
 * server-side SECURITY DEFINER function. This works regardless of the
 * caller's role — teachers/staff can trigger it safely.
 */
export async function notifyBranchApprovers(
  branchId: string,
  excludeUserId: string | null,
  title: string,
  message: string,
  type: string,
  actionUrl?: string,
  referenceId?: string,
  groupKey?: string,
  priority: string = "high"
) {
  try {
    await supabase.rpc("notify_approvers", {
      _branch_id: branchId,
      _exclude_user_id: excludeUserId,
      _title: title,
      _message: message,
      _type: type,
      _action_url: actionUrl ?? null,
      _reference_id: referenceId ?? null,
      _group_key: groupKey ?? null,
      _priority: priority,
    });
  } catch {
    // best-effort
  }
}

/**
 * Notify the approvers resolved for a given submitter + workflow, using the
 * unified `resolve_approvers` precedence:
 *   staff override (approval_routing) -> reports_to -> branch manager -> super_admin.
 *
 * Always falls back to branch-wide approvers if the RPC returns nothing,
 * so legacy flows never silently lose their notification.
 */
export async function notifyWorkflowApprovers(
  submitterUserId: string,
  branchId: string,
  workflow: ApprovalWorkflow,
  title: string,
  message: string,
  type: string,
  actionUrl?: string,
  referenceId?: string,
  groupKey?: string,
  priority: string = "high"
) {
  try {
    const { data, error } = await supabase.rpc("resolve_approvers", {
      _user_id: submitterUserId,
      _workflow: workflow,
    });
    if (error) throw error;

    const row: any = Array.isArray(data) ? data[0] : data;
    const recipients = new Set<string>();
    if (row) {
      if (row.l1_approver) recipients.add(row.l1_approver);
      if (row.l2_approver) recipients.add(row.l2_approver);
      for (const u of (row.notify_submit ?? []) as string[]) {
        if (u) recipients.add(u);
      }
    }
    recipients.delete(submitterUserId);

    if (recipients.size > 0) {
      await notifyUsers(
        Array.from(recipients),
        title,
        message,
        type,
        referenceId,
        actionUrl,
        groupKey,
        priority
      );
      return;
    }
  } catch {
    // fall through to branch-wide notification
  }

  // Fallback: notify everyone with approval authority in the branch
  // HR workflows: restrict to admin + super_admin (exclude franchisee).
  try {
    const ids = (await getBranchManagerIds(branchId)).filter(
      (id) => id !== submitterUserId
    );
    if (ids.length > 0) {
      await notifyUsers(
        ids,
        title,
        message,
        type,
        referenceId,
        actionUrl,
        groupKey,
        priority
      );
    }
  } catch {
    // best-effort
  }
}

/** Get branch manager user IDs (franchisee + admin + super_admin in branch) - uses SECURITY DEFINER */
export async function getBranchManagerIds(branchId: string): Promise<string[]> {
  try {
    const { data } = await supabase.rpc("get_branch_approver_ids", {
      _branch_id: branchId,
    });
    const ids = (data as string[]) ?? [];
    if (ids.length === 0) return [];
    // Restrict HR workflow approvers to admin + super_admin only.
    // Franchisees should not receive HR-related notifications (leave/OT/claims/payroll).
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    return (roles ?? [])
      .filter((r: any) => r.role === "admin" || r.role === "super_admin")
      .map((r: any) => r.user_id);
  } catch {
    // Fallback to client-side query
    const { data: members } = await supabase
      .from("branch_memberships")
      .select("user_id")
      .eq("branch_id", branchId);
    if (!members?.length) return [];

    const memberIds = members.map((m) => m.user_id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", memberIds);
    if (!roles?.length) return [];

    return roles
      .filter((r: any) => ["admin", "super_admin"].includes(r.role))
      .map((r: any) => r.user_id);
  }
}
