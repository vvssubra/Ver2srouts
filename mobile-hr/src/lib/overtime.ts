import { formatStatusLabel } from "../components/ui/StatusPill";
import type { OvertimeRequest, OvertimeRequestInsert } from "./hr-types";

/**
 * Pure business logic for the Overtime (self-service) screen. Kept free of
 * any Supabase/React Native imports so it can be unit tested without
 * rendering anything or touching the network.
 *
 * Note on `resolveBranchId`: `src/lib/leave.ts` and `src/lib/claims.ts` both
 * define an equivalent helper, but those files are owned by other agents
 * working concurrently in this same repo. Rather than import across module
 * boundaries mid-build, the same tiny helper is duplicated locally here,
 * matching the precedent those two modules already set.
 */
export function resolveBranchId(memberships: { branch_id: string }[]): string | null {
  return memberships[0]?.branch_id ?? null;
}

// ---------------------------------------------------------------------------
// Date / time string validation
// ---------------------------------------------------------------------------

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether a string is a well-formed `yyyy-MM-dd` calendar date. */
export function isValidDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // `Date` silently rolls over out-of-range days/months (e.g. Feb 31 ->
  // Mar 3) instead of rejecting them, so round-trip the parsed value back
  // to a string and compare rather than trusting getTime() alone.
  return parsed.toISOString().slice(0, 10) === value;
}

/** Whether a string is a well-formed 24-hour `HH:MM` time of day. */
export function isValidTimeString(value: string): boolean {
  return TIME_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Hours math
// ---------------------------------------------------------------------------

/**
 * Hours between two ISO datetime strings, as a decimal rounded to 2
 * decimal places (e.g. `2.5`).
 *
 * Assumption (v1): callers must pass full datetimes that already encode
 * the correct calendar day for each end — i.e. `endTime` must be strictly
 * after `startTime`, including for an overnight shift where the end time
 * on the clock is earlier than the start time but is actually the next
 * day. This function does not infer day rollover itself; use
 * `buildShiftTimestamps` to build day-correct datetimes from a single
 * shift date plus start/end clock times.
 *
 * Invalid input (unparseable strings, or `endTime` not after `startTime`)
 * returns `0` rather than throwing, so it's safe to call from render logic
 * before a user has finished picking a full shift.
 */
export function computeHours(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;

  const hours = diffMs / (1000 * 60 * 60);
  return Math.round(hours * 100) / 100;
}

/**
 * Combines a single shift date with separate start/end clock times (both
 * `HH:MM`) into full ISO-ish datetime strings, rolling the end date to the
 * next calendar day when `endTime` is not after `startTime` on the clock
 * (i.e. an overnight shift, e.g. 22:00 -> 02:00).
 */
export function buildShiftTimestamps(
  date: string,
  startTime: string,
  endTime: string
): { startDateTime: string; endDateTime: string } {
  const startDateTime = `${date}T${startTime}:00`;
  const endDate = endTime <= startTime ? addOneDay(date) : date;
  const endDateTime = `${endDate}T${endTime}:00`;
  return { startDateTime, endDateTime };
}

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Submission window
// ---------------------------------------------------------------------------

/**
 * Client-side mirror of the server-side `enforce_ot_submission_window`
 * trigger, used to give a fast, friendly inline error before the request
 * ever reaches the network. The server still enforces this — if it
 * disagrees (e.g. this check drifts from the trigger, or a race lets the
 * calendar month roll over between check and submit), the insert is
 * rejected there too, and that error should be shown to the user rather
 * than swallowed.
 *
 * True only when `otDate`'s calendar month is the previous, same, or next
 * month relative to `referenceDate`'s calendar month.
 */
export function isWithinSubmissionWindow(otDate: string, referenceDate: string): boolean {
  const ot = parseYearMonth(otDate);
  const ref = parseYearMonth(referenceDate);
  if (!ot || !ref) return false;

  const diff = (ot.year - ref.year) * 12 + (ot.month - ref.month);
  return diff >= -1 && diff <= 1;
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface OvertimeFormInput {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  reason: string;
}

/**
 * Validates an overtime submission before it's sent to the server. Returns
 * a human-readable error message, or `null` when the input is valid. Does
 * NOT check the submission window — call `isWithinSubmissionWindow`
 * separately, since that check needs a reference ("today") date and
 * benefits from its own dedicated, more specific error message.
 */
export function validateOvertimeRequest(input: OvertimeFormInput): string | null {
  if (!isValidDateString(input.date)) {
    return "Enter a valid date (YYYY-MM-DD).";
  }
  if (!isValidTimeString(input.startTime) || !isValidTimeString(input.endTime)) {
    return "Enter valid start and end times (HH:MM).";
  }
  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    return "End time must be after start time.";
  }
  if (!input.reason.trim()) {
    return "Enter a reason for the overtime.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

/**
 * Human-readable display status for the overtime history list. Overtime
 * doesn't have a multi-stage approval workflow to reconcile like claims or
 * leave (this module is submit + status only — approval/amendment/
 * cancellation are a later phase), so this is a thin pass-through of the
 * row's raw `status` through the shared `formatStatusLabel` helper rather
 * than a reimplementation of label formatting.
 */
export function deriveOvertimeDisplayStatus(row: Pick<OvertimeRequest, "status">): string {
  return formatStatusLabel(row.status);
}

// ---------------------------------------------------------------------------
// Insert payload builder
// ---------------------------------------------------------------------------

export interface OvertimeInsertInput {
  userId: string;
  branchId: string;
  date: string;
  startDateTime: string;
  endDateTime: string;
  hours: number;
  reason: string;
  submittedAt: string;
}

/**
 * Builds the `overtime_requests` insert payload for a new self-service
 * request.
 *
 * Simplification: `ot_month`, `payroll_month`, and `is_late_submission`
 * are intentionally left out of the payload. They're optional columns
 * (the DB fills sensible defaults / the `enforce_ot_submission_window`
 * trigger derives them), and computing "which payroll month does this
 * land in" correctly depends on payroll cutoff rules this module doesn't
 * own. Best-effort date-only math here would risk silently disagreeing
 * with the server's authoritative computation, so this defers to it.
 */
export function buildOvertimeInsert(input: OvertimeInsertInput): OvertimeRequestInsert {
  return {
    user_id: input.userId,
    branch_id: input.branchId,
    date: input.date,
    start_time: input.startDateTime,
    end_time: input.endDateTime,
    hours: input.hours,
    reason: input.reason.trim(),
    status: "pending",
    submitted_at: input.submittedAt,
  };
}
