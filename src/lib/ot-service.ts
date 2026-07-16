import { supabase } from "@/integrations/supabase/client";
import {
  notifyAndEmailSubmitterDecision,
  notifyAndEmailWorkflowApprovers,
  notifyUsers,
} from "@/lib/notify";

/* ===========================================================
 * OT + Payroll Period business logic (client-side service).
 * Backend rules are enforced by RLS + DB trigger; this layer
 * provides the workflow orchestration the UI calls into.
 * =========================================================== */

export type OtRow = {
  id: string;
  user_id: string;
  branch_id: string;
  date: string;            // YYYY-MM-DD
  start_time: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: string;
  ot_month: string | null;
  payroll_month: string | null;
  is_late_submission: boolean;
  submitted_at: string | null;
  version: number;
  parent_request_id: string | null;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;
  amendment_requested_at: string | null;
  payroll_adjustment_id: string | null;
  payment_status: string;
  paid_at: string | null;
};

export type ComputedPayroll = {
  payroll_month: string | null;
  is_late: boolean;
  is_allowed: boolean;
  message?: string;
};

const REJECT_MSG =
  "This overtime request is outside the allowable submission period. Please contact HR for assistance.";

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Synchronous client-side mirror of the SQL `compute_payroll_month`.
 * Used for date-picker bounds and the preview label. For previous-month OT
 * this assumes the worst case (previous payroll already Paid → Late), so the
 * UI stays decisive without a network call. Submission uses the async version
 * below, which consults `payroll_records` and is authoritative.
 */
export function computePayrollMonth(otDate: Date, submittedAt: Date = new Date()): ComputedPayroll {
  const submittedMonth = firstOfMonth(submittedAt);
  const otMonth = firstOfMonth(otDate);
  const prevMonth = new Date(submittedMonth);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const nextMonth = new Date(submittedMonth);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  if (otMonth.getTime() === submittedMonth.getTime()) {
    return { payroll_month: fmtDate(submittedMonth), is_late: false, is_allowed: true };
  }
  if (otMonth.getTime() === nextMonth.getTime()) {
    return { payroll_month: fmtDate(nextMonth), is_late: false, is_allowed: true };
  }
  if (otMonth.getTime() === prevMonth.getTime()) {
    // Worst-case assumption for the sync UI preview: treat as late.
    return { payroll_month: fmtDate(submittedMonth), is_late: true, is_allowed: true };
  }
  return { payroll_month: null, is_late: false, is_allowed: false, message: REJECT_MSG };
}

/**
 * Authoritative payroll-month computation. Calls the SQL function which checks
 * whether the previous month's payroll has been Paid for the given branch.
 */
export async function computePayrollMonthAsync(
  otDate: Date,
  branchId: string | null,
  submittedAt: Date = new Date(),
): Promise<ComputedPayroll> {
  const { data, error } = await supabase.rpc("compute_payroll_month", {
    _ot_date: fmtDate(otDate),
    _submitted_at: submittedAt.toISOString(),
    _branch_id: branchId,
  } as any);
  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    // Fall back to the sync mirror if the RPC is unreachable.
    return computePayrollMonth(otDate, submittedAt);
  }
  const row: any = Array.isArray(data) ? data[0] : data;
  return {
    payroll_month: row.payroll_month ?? null,
    is_late: !!row.is_late,
    is_allowed: !!row.is_allowed,
    message: row.is_allowed ? undefined : REJECT_MSG,
  };
}

/** Salary pay date for a payroll month = the 7th of the *next* month. */
export function salaryPayDate(payrollMonth: string | Date): Date {
  const d = typeof payrollMonth === "string" ? new Date(payrollMonth) : payrollMonth;
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 7);
  return next;
}

/** True from 1st through 6th of the current month. */
export function isPayrollBannerWindow(today: Date = new Date()): boolean {
  return today.getDate() >= 1 && today.getDate() <= 6;
}

async function audit(otId: string, action: string, before?: any, after?: any, notes?: string) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("ot_audit_log").insert({
    ot_request_id: otId,
    action,
    actor_id: u.user?.id ?? null,
    before_snapshot: before ?? null,
    after_snapshot: after ?? null,
    notes: notes ?? null,
  });
}

/* ---------- Staff actions ---------- */

export async function submitOt(params: {
  userId: string;
  branchId: string;
  date: string;          // YYYY-MM-DD
  startTime: string;     // ISO
  endTime: string;       // ISO
  hours: number;
  reason?: string;
  requesterName?: string;
}): Promise<{ ok: boolean; id?: string; error?: string; isLate?: boolean; payrollMonth?: string }> {
  const computed = await computePayrollMonthAsync(new Date(params.date), params.branchId);
  if (!computed.is_allowed) {
    return { ok: false, error: REJECT_MSG };
  }
  const otMonth = fmtDate(firstOfMonth(new Date(params.date)));
  const initialStatus = computed.is_late ? "late_pending_approval" : "pending_approval";

  const { data, error } = await supabase
    .from("overtime_requests")
    .insert({
      user_id: params.userId,
      branch_id: params.branchId,
      date: params.date,
      start_time: params.startTime,
      end_time: params.endTime,
      hours: params.hours,
      reason: params.reason ?? null,
      status: initialStatus,
      ot_month: otMonth,
      payroll_month: computed.payroll_month,
      is_late_submission: computed.is_late,
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create OT" };

  await audit(data.id, "submitted", null, { status: initialStatus, is_late: computed.is_late });

  await notifyAndEmailWorkflowApprovers({
    submitterUserId: params.userId,
    branchId: params.branchId,
    workflow: "ot",
    title: computed.is_late ? "Late OT submitted" : "New OT request",
    message: `${params.requesterName ?? "A staff member"} submitted OT for ${params.date} (${params.hours}h)${computed.is_late ? " — LATE SUBMISSION" : ""}`,
    type: "overtime",
    actionUrl: "/overtime-requests",
    referenceId: data.id,
    requesterName: params.requesterName ?? "Staff",
    requestType: "Overtime",
    summary: `${params.hours}h on ${params.date}${computed.is_late ? " (late)" : ""}`,
    details: [
      { label: "OT Month", value: otMonth },
      { label: "Payroll Month", value: computed.payroll_month ?? "—" },
      ...(computed.is_late ? [{ label: "Type", value: "LATE SUBMISSION" }] : []),
      ...(params.reason ? [{ label: "Reason", value: params.reason }] : []),
    ],
    emailIdempotencyKey: `ot-submitted-${data.id}`,
  });

  return { ok: true, id: data.id, isLate: computed.is_late, payrollMonth: computed.payroll_month! };
}

export async function editPendingOt(id: string, patch: Partial<{ date: string; start_time: string; end_time: string; hours: number; reason: string }>) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  if (!["pending_approval", "late_pending_approval", "draft", "submitted", "pending"].includes(before.status)) {
    return { ok: false, error: "Only pending OT can be edited" };
  }
  let extra: any = {};
  if (patch.date) {
    const c = await computePayrollMonthAsync(new Date(patch.date), before.branch_id);
    if (!c.is_allowed) return { ok: false, error: REJECT_MSG };
    extra = {
      ot_month: fmtDate(firstOfMonth(new Date(patch.date))),
      payroll_month: c.payroll_month,
      is_late_submission: c.is_late,
    };
  }
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("overtime_requests")
    .update({ ...patch, ...extra, edited_by: u.user?.id, edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(id, "edited", before, { ...patch, ...extra });
  return { ok: true };
}

export async function cancelPendingOt(id: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  if (!["pending_approval", "late_pending_approval", "draft", "submitted", "pending"].includes(before.status)) {
    return { ok: false, error: "Approved OT requires a cancellation request" };
  }
  const { error } = await supabase.from("overtime_requests").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function requestAmendment(id: string, changes: { start_time?: string; end_time?: string; hours?: number; reason?: string }, note?: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  if (!["approved", "pending_payroll", "assigned_next_payroll", "paid"].includes(before.status)) {
    return { ok: false, error: "Only approved OT can be amended" };
  }
  // Create a child version row holding the proposed values; original remains unchanged.
  const { data: child, error } = await supabase
    .from("overtime_requests")
    .insert({
      user_id: before.user_id,
      branch_id: before.branch_id,
      date: before.date,
      start_time: changes.start_time ?? before.start_time,
      end_time: changes.end_time ?? before.end_time,
      hours: changes.hours ?? before.hours,
      reason: changes.reason ?? before.reason,
      status: "amendment_requested",
      ot_month: before.ot_month,
      payroll_month: before.payroll_month,
      is_late_submission: false,
      submitted_at: new Date().toISOString(),
      version: (before.version ?? 1) + 1,
      parent_request_id: before.id,
    })
    .select("id")
    .single();
  if (error || !child) return { ok: false, error: error?.message };
  await supabase
    .from("overtime_requests")
    .update({ amendment_requested_at: new Date().toISOString() })
    .eq("id", before.id);
  await audit(child.id, "amendment_requested", before, changes, note);
  await notifyAndEmailWorkflowApprovers({
    submitterUserId: before.user_id,
    branchId: before.branch_id,
    workflow: "ot",
    title: "OT amendment requested",
    message: `Staff requested amendment for OT on ${before.date}`,
    type: "overtime",
    actionUrl: "/overtime-requests",
    referenceId: child.id,
    requesterName: "Staff",
    requestType: "Overtime amendment",
    details: [
      { label: "Original hours", value: String(before.hours) },
      { label: "New hours", value: String(changes.hours ?? before.hours) },
      ...(note ? [{ label: "Note", value: note }] : []),
    ],
    emailIdempotencyKey: `ot-amend-req-${child.id}`,
  });
  return { ok: true, amendmentId: child.id };
}

export async function requestCancellation(id: string, reason: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  if (!["approved", "pending_payroll", "assigned_next_payroll", "paid"].includes(before.status)) {
    return { ok: false, error: "Only approved OT can request cancellation" };
  }
  const { error } = await supabase
    .from("overtime_requests")
    .update({
      status: "cancellation_requested",
      cancellation_reason: reason,
      cancellation_requested_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(id, "cancellation_requested", before, { reason });
  await notifyAndEmailWorkflowApprovers({
    submitterUserId: before.user_id,
    branchId: before.branch_id,
    workflow: "ot",
    title: "OT cancellation requested",
    message: `Staff requested cancellation for OT on ${before.date}`,
    type: "overtime",
    actionUrl: "/overtime-requests",
    referenceId: id,
    requesterName: "Staff",
    requestType: "Overtime cancellation",
    details: [
      { label: "Date", value: before.date },
      { label: "Hours", value: String(before.hours) },
      { label: "Reason", value: reason },
    ],
    emailIdempotencyKey: `ot-cancel-req-${id}`,
  });
  return { ok: true };
}

/* ---------- HR / Super Admin actions ---------- */

export async function approveOt(id: string, note?: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  const { data: u } = await supabase.auth.getUser();
  const isLate = before.is_late_submission || before.status === "late_pending_approval";
  const newStatus = isLate ? "assigned_next_payroll" : "pending_payroll";

  const { error } = await supabase
    .from("overtime_requests")
    .update({
      status: newStatus,
      approved_by: u.user?.id,
      approved_at: new Date().toISOString(),
      review_notes: note ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // For LATE OT: create a payroll_adjustment to flow into the next payroll.
  let adjustmentId: string | null = null;
  if (isLate) {
    const { data: adj } = await supabase
      .from("payroll_adjustments")
      .insert({
        branch_id: before.branch_id,
        staff_id: before.user_id,
        source_type: "late_ot",
        source_ref_id: id,
        hours: before.hours,
        amount: 0, // payroll engine will compute amount from hours x rate
        reason: `Late OT for ${before.date}`,
        status: "approved",
        target_payroll_month: before.payroll_month,
        approved_by: u.user?.id,
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    adjustmentId = adj?.id ?? null;
    if (adjustmentId) {
      await supabase.from("overtime_requests").update({ payroll_adjustment_id: adjustmentId }).eq("id", id);
    }
  }

  await audit(id, isLate ? "late_approved" : "approved", before, { status: newStatus, adjustmentId });

  await notifyAndEmailSubmitterDecision({
    submitterUserId: before.user_id,
    title: isLate ? "Late OT approved" : "OT approved",
    message: isLate
      ? `Your late OT for ${before.date} was approved and will be paid in the ${before.payroll_month} payroll.`
      : `Your OT for ${before.date} was approved.`,
    type: "overtime",
    actionUrl: "/overtime",
    referenceId: id,
    templateName: "ot-request-status",
    templateData: {
      status: "approved",
      otDate: before.date,
      hours: String(before.hours),
      reason: before.reason ?? undefined,
      approverNote: note,
      intro: isLate
        ? `Your LATE overtime submission has been approved. It will be paid in the ${before.payroll_month} payroll.`
        : undefined,
    },
    emailIdempotencyKey: `ot-approved-${id}`,
  });
  return { ok: true };
}

export async function rejectOt(id: string, reason: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before) return { ok: false, error: "Not found" };
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("overtime_requests")
    .update({ status: "rejected", approved_by: u.user?.id, approved_at: new Date().toISOString(), review_notes: reason })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  await audit(id, "rejected", before, { reason });
  await notifyAndEmailSubmitterDecision({
    submitterUserId: before.user_id,
    title: "OT rejected",
    message: `Your OT for ${before.date} was rejected. Reason: ${reason}`,
    type: "overtime",
    actionUrl: "/overtime",
    referenceId: id,
    templateName: "ot-request-status",
    templateData: {
      status: "rejected",
      otDate: before.date,
      hours: String(before.hours),
      approverNote: reason,
    },
    emailIdempotencyKey: `ot-rejected-${id}`,
  });
  return { ok: true };
}

export async function approveAmendment(amendmentId: string) {
  const { data: child } = await supabase.from("overtime_requests").select("*").eq("id", amendmentId).single();
  if (!child || !child.parent_request_id) return { ok: false, error: "Not an amendment" };
  const { data: parent } = await supabase
    .from("overtime_requests").select("*").eq("id", child.parent_request_id).single();
  if (!parent) return { ok: false, error: "Parent not found" };
  const { data: u } = await supabase.auth.getUser();
  const alreadyPaid = parent.status === "paid";

  // Activate the new version; original keeps its row for audit.
  await supabase.from("overtime_requests")
    .update({
      status: alreadyPaid ? "assigned_next_payroll" : "pending_payroll",
      approved_by: u.user?.id,
      approved_at: new Date().toISOString(),
      amendment_approved_at: new Date().toISOString(),
      amendment_approved_by: u.user?.id,
    })
    .eq("id", amendmentId);

  // If the original was already paid, create a delta payroll adjustment.
  if (alreadyPaid) {
    const deltaHours = Number(child.hours) - Number(parent.hours);
    await supabase.from("payroll_adjustments").insert({
      branch_id: parent.branch_id,
      staff_id: parent.user_id,
      source_type: "ot_amendment",
      source_ref_id: amendmentId,
      hours: deltaHours,
      amount: 0,
      reason: `Amendment delta for OT ${parent.date}: ${parent.hours}h → ${child.hours}h`,
      status: "approved",
      target_payroll_month: fmtDate(firstOfMonth(new Date())),
      approved_by: u.user?.id,
      approved_at: new Date().toISOString(),
    });
  }

  await audit(amendmentId, "amendment_approved", parent, child);
  await notifyAndEmailSubmitterDecision({
    submitterUserId: parent.user_id,
    title: "OT amendment approved",
    message: `Your amendment for OT on ${parent.date} was approved.`,
    type: "overtime",
    actionUrl: "/overtime",
    referenceId: amendmentId,
    templateName: "ot-request-status",
    templateData: {
      status: "approved",
      otDate: parent.date,
      hours: String(child.hours),
      intro: `Your amendment request was approved. New hours: ${child.hours}h (was ${parent.hours}h).`,
    },
    emailIdempotencyKey: `ot-amend-approved-${amendmentId}`,
  });
  return { ok: true };
}

export async function approveCancellation(id: string) {
  const { data: before } = await supabase.from("overtime_requests").select("*").eq("id", id).single();
  if (!before || before.status !== "cancellation_requested") return { ok: false, error: "Not pending cancellation" };
  const { data: u } = await supabase.auth.getUser();
  const alreadyPaid = before.payment_status === "paid";

  await supabase.from("overtime_requests").update({
    status: "cancelled",
    cancellation_approved_at: new Date().toISOString(),
    cancellation_approved_by: u.user?.id,
  }).eq("id", id);

  // If already paid, create a negative payroll adjustment to claw back.
  if (alreadyPaid) {
    await supabase.from("payroll_adjustments").insert({
      branch_id: before.branch_id,
      staff_id: before.user_id,
      source_type: "ot_cancellation",
      source_ref_id: id,
      hours: -Number(before.hours),
      amount: 0,
      reason: `Cancellation of paid OT ${before.date}: ${before.cancellation_reason ?? "—"}`,
      status: "approved",
      target_payroll_month: fmtDate(firstOfMonth(new Date())),
      approved_by: u.user?.id,
      approved_at: new Date().toISOString(),
    });
  }

  await audit(id, "cancellation_approved", before, { status: "cancelled" });
  await notifyAndEmailSubmitterDecision({
    submitterUserId: before.user_id,
    title: "OT cancellation approved",
    message: `Your cancellation for OT on ${before.date} was approved.`,
    type: "overtime",
    actionUrl: "/overtime",
    referenceId: id,
    templateName: "ot-request-status",
    templateData: {
      status: "approved",
      otDate: before.date,
      hours: String(before.hours),
      intro: alreadyPaid
        ? "Your cancellation was approved. A reversing payroll adjustment will be applied in the next payroll."
        : "Your cancellation was approved. This OT will not be included in payroll.",
    },
    emailIdempotencyKey: `ot-cancel-approved-${id}`,
  });
  return { ok: true };
}

/* ---------- Payroll Adjustments ---------- */

export async function createManualAdjustment(params: {
  branchId: string;
  staffId: string;
  sourceType: "manual_correction" | "additional_payment" | "deduction";
  amount: number;
  reason: string;
  targetPayrollMonth: string; // YYYY-MM-01
}) {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("payroll_adjustments")
    .insert({
      branch_id: params.branchId,
      staff_id: params.staffId,
      source_type: params.sourceType,
      amount: params.amount,
      reason: params.reason,
      status: "approved",
      target_payroll_month: params.targetPayrollMonth,
      approved_by: u.user?.id,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await notifyUsers(
    [params.staffId],
    "Payroll adjustment created",
    `An adjustment of ${params.amount} (${params.sourceType.replace("_", " ")}) was added to your ${params.targetPayrollMonth} payroll.`,
    "payroll",
    data?.id,
    "/payroll/adjustments"
  );
  return { ok: true, id: data?.id };
}

export const OT_BLOCKED_MESSAGE = REJECT_MSG;