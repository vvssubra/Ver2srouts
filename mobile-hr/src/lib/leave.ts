import type { CustomLeaveBalance, CustomLeaveType, LeaveBalance, LeaveRequest, LeaveRequestInsert } from "./hr-types";
import type { Database } from "./database.types";

export { resolveBranchId } from "./branch";

/**
 * Pure business logic for the Leave (self-service) screen. Kept free of
 * any Supabase/React Native imports so it can be unit tested without
 * rendering anything or touching the network.
 */

// ---------------------------------------------------------------------------
// Standard leave types
// ---------------------------------------------------------------------------

export const STANDARD_LEAVE_TYPES: { value: string; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "medical", label: "Medical" },
  { value: "hospitalisation", label: "Hospitalisation" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "unpaid", label: "Unpaid" },
  { value: "emergency", label: "Emergency" },
  { value: "compassionate", label: "Compassionate" },
  { value: "replacement", label: "Replacement" },
];

const ATTACHMENT_REQUIRED_STANDARD_TYPES = new Set(["medical", "hospitalisation", "compassionate"]);

// ---------------------------------------------------------------------------
// Date / hours math
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a string is a well-formed `yyyy-MM-dd` calendar date (used to
 * validate the free-text date fields on the request form, since this
 * project has no native date-picker dependency installed).
 */
export function isValidDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // `Date` silently rolls over out-of-range days/months (e.g. Feb 31 ->
  // Mar 3) instead of rejecting them, so round-trip the parsed value back
  // to a string and compare rather than trusting getTime() alone.
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Inclusive day count between two ISO ("yyyy-MM-dd") date strings.
 *
 * - A half-day request always counts as 0.5, regardless of the date span
 *   entered (the UI still needs a single calendar date for a half day, but
 *   the "range" the date picker produces for it is irrelevant to the
 *   count).
 * - When `endDate` is before `startDate` this returns 0 rather than
 *   throwing: it's invalid input, but it's the form's job (via
 *   `validateLeaveRequest`) to turn that into a friendly inline message,
 *   not this function's job to throw and force a try/catch everywhere it's
 *   called (including from render logic that just wants a number to show
 *   before the user has finished picking dates).
 */
export function computeDays(startDate: string, endDate: string, isHalfDay: boolean): number {
  if (isHalfDay) return 0.5;

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (diffDays < 0) return 0;
  return diffDays + 1;
}

// ---------------------------------------------------------------------------
// Attachment requirement
// ---------------------------------------------------------------------------

/**
 * Whether a leave request of this type needs a supporting document
 * attached before it can be submitted. True for the standard types that
 * are inherently evidence-backed (medical, hospitalisation,
 * compassionate), or when a branch's custom leave type has explicitly
 * opted into requiring one.
 */
export function requiresAttachment(
  leaveType: string,
  customType?: { requires_attachment: boolean } | null
): boolean {
  if (ATTACHMENT_REQUIRED_STANDARD_TYPES.has(leaveType)) return true;
  if (customType?.requires_attachment) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

type StandardBalanceKey = Exclude<(typeof STANDARD_LEAVE_TYPES)[number]["value"], "unpaid">;

/**
 * Remaining days for a standard leave type, read off the matching
 * `{type}_total` / `{type}_used` pair on a `leave_balances` row (e.g.
 * `annual_total` / `annual_used` for `"annual"`).
 *
 * Unpaid leave is a deliberate special case: it always returns `Infinity`,
 * never a number read off the balance row. Unpaid leave isn't
 * balance-limited by policy — staff can take unpaid leave whenever
 * approved, so there is no cap to enforce and no "days remaining" to show
 * as a hard limit.
 *
 * A missing balance row (not yet provisioned for the year) falls back to
 * 0 for every type except unpaid, rather than crashing on a null read.
 */
export function remainingBalance(leaveType: string, balance: LeaveBalance | null): number {
  if (leaveType === "unpaid") return Infinity;
  if (!balance) return 0;

  const totalKey = `${leaveType}_total` as keyof LeaveBalance;
  const usedKey = `${leaveType}_used` as keyof LeaveBalance;
  const total = Number(balance[totalKey] ?? 0);
  const used = Number(balance[usedKey] ?? 0);
  const remaining = total - used;
  return remaining > 0 ? remaining : 0;
}

/**
 * Remaining days for a branch's custom leave type. Custom balances live
 * in a separate `custom_leave_balances` table (one generic total/used
 * pair per custom type, rather than the wide per-type columns
 * `leave_balances` uses for the standard types).
 *
 * When no balance row has been provisioned yet for this person/type/year,
 * falls back to the custom type's configured `default_days` so a brand
 * new custom type still shows something sensible instead of 0/0.
 */
export function remainingCustomBalance(
  balance: CustomLeaveBalance | null | undefined,
  defaultDays: number
): number {
  if (!balance) return defaultDays > 0 ? defaultDays : 0;
  const remaining = balance.total - balance.used;
  return remaining > 0 ? remaining : 0;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface LeaveRequestValidationInput {
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  hasAttachment: boolean;
  customType?: { requires_attachment: boolean } | null;
}

/**
 * Validates a leave request before submission. Returns a human-readable
 * error message, or `null` when the request is valid.
 *
 * Rules, in order:
 * 1. Start and end dates must both be present.
 * 2. End date must not be before the start date.
 * 3. `days` must not exceed `remaining` — skipped entirely when
 *    `remaining` is `Infinity` (unpaid leave has no cap to check against).
 * 4. `reason` is always optional — never validated.
 * 5. An attachment must be present when `requiresAttachment()` says this
 *    leave type needs one.
 */
export function validateLeaveRequest(
  input: LeaveRequestValidationInput,
  remaining: number
): string | null {
  if (!input.startDate || !input.endDate) {
    return "Select a start and end date.";
  }
  if (input.endDate < input.startDate) {
    return "End date can't be before the start date.";
  }
  if (remaining !== Infinity && input.days > remaining) {
    return `Not enough balance: only ${remaining} day${remaining === 1 ? "" : "s"} remaining.`;
  }
  if (requiresAttachment(input.leaveType, input.customType) && !input.hasAttachment) {
    return "This leave type requires a supporting document.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export type LeaveDisplayStatusRow = Pick<
  LeaveRequest,
  "status" | "level1_status" | "level2_status" | "max_approval_level"
>;

/**
 * Human-readable status for the history list, reconciling the row's
 * terminal `status` column with its two-stage approval workflow fields.
 *
 * - `rejected` / `cancelled` on the overall row always wins and is shown
 *   as-is.
 * - Otherwise, if this request's workflow doesn't need a second approval
 *   level (`max_approval_level < 2`) or the second level has already
 *   approved, it's "Approved".
 * - Otherwise, if the first level has approved (but the second hasn't
 *   yet), it's "Awaiting final approval" — distinct from plain "Pending"
 *   so staff can see the request has moved, not stalled.
 * - Otherwise it's "Pending".
 */
export function deriveLeaveDisplayStatus(row: LeaveDisplayStatusRow): string {
  if (row.status === "rejected") return "Rejected";
  if (row.status === "cancelled") return "Cancelled";
  if (row.status === "approved") return "Approved";

  const needsLevel2 = row.max_approval_level >= 2;
  if (!needsLevel2) {
    return row.level1_status === "approved" ? "Approved" : "Pending";
  }

  if (row.level2_status === "approved") return "Approved";
  if (row.level1_status === "approved") return "Awaiting final approval";
  return "Pending";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Display label for a leave request row, resolving custom types by id. */
export function leaveTypeLabel(
  row: Pick<LeaveRequest, "leave_type" | "custom_leave_type_id">,
  customTypes: CustomLeaveType[]
): string {
  if (row.leave_type === "custom") {
    const match = customTypes.find((c) => c.id === row.custom_leave_type_id);
    return match?.name ?? "Custom";
  }
  const found = STANDARD_LEAVE_TYPES.find((t) => t.value === row.leave_type);
  return found?.label ?? row.leave_type;
}

// ---------------------------------------------------------------------------
// Insert / update payload builders
// ---------------------------------------------------------------------------

export interface BuildLeaveRequestInsertInput {
  userId: string;
  branchId: string;
  leaveType: string;
  customLeaveTypeId?: string | null;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  reason?: string | null;
  attachmentUrl?: string | null;
}

export function buildLeaveRequestInsert(input: BuildLeaveRequestInsertInput): LeaveRequestInsert {
  const trimmedReason = input.reason?.trim();
  return {
    user_id: input.userId,
    branch_id: input.branchId,
    leave_type: input.leaveType as LeaveRequestInsert["leave_type"],
    custom_leave_type_id: input.customLeaveTypeId ?? null,
    start_date: input.startDate,
    end_date: input.endDate,
    days: input.days,
    is_half_day: input.isHalfDay,
    reason: trimmedReason ? trimmedReason : null,
    attachment_url: input.attachmentUrl ?? null,
    status: "pending",
  };
}

type LeaveRequestUpdate = Database["public"]["Tables"]["leave_requests"]["Update"];

/** Cancelling never reverses balance usage: a still-pending request was never approved, so no `_used` column was ever incremented for it. */
export function buildCancelLeaveRequestUpdate(
  cancelledBy: string,
  now: string = new Date().toISOString()
): LeaveRequestUpdate {
  return {
    status: "cancelled",
    cancelled_by: cancelledBy,
    cancelled_at: now,
  };
}

export type { StandardBalanceKey };
