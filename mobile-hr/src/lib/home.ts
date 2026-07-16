import type { StaffAttendance } from "./hr-types";

/**
 * Pure business logic for the Home dashboard screen. Kept free of any
 * Supabase/React Native imports so it can be unit tested without
 * rendering anything or touching the network.
 */

export type ClockStatus = "not_clocked_in" | "clocked_in" | "completed";

type AttendanceLike = Pick<StaffAttendance, "clock_in" | "clock_out"> | null | undefined;

/**
 * Derives today's clock status from a `staff_attendance` row (or the
 * absence of one).
 *
 * - no row, or a row with no clock_in yet -> not_clocked_in
 * - clock_in set, clock_out still null -> clocked_in
 * - both set -> completed
 *
 * `now` is accepted (rather than reading the row's `date` alone) so the
 * caller's notion of "today" always drives what's displayed, even though
 * the current rules don't need to branch on it themselves.
 */
export function deriveClockStatus(row: AttendanceLike, _now: Date): ClockStatus {
  if (!row || !row.clock_in) return "not_clocked_in";
  if (!row.clock_out) return "clocked_in";
  return "completed";
}

export function clockStatusCopy(status: ClockStatus): { title: string; message: string } {
  switch (status) {
    case "not_clocked_in":
      return {
        title: "Not clocked in yet",
        message: "Tap Clock In when you start your day.",
      };
    case "clocked_in":
      return {
        title: "Clocked in",
        message: "You're on the clock. Don't forget to clock out later.",
      };
    case "completed":
      return {
        title: "Shift completed",
        message: "You've clocked in and out for today.",
      };
  }
}

/**
 * Remaining leave days for a balance row. Floors at 0 — usage can exceed
 * an allotment (e.g. an admin correction hasn't landed yet) but the
 * dashboard should never show a negative remaining count.
 */
export function remainingDays(total: number, used: number): number {
  const remaining = total - used;
  return remaining > 0 ? remaining : 0;
}

/** Formats a Date as the local yyyy-MM-dd string matching a Postgres `date` column. */
export function todayDateString(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "You have N pending requests" copy for the dashboard, or null when
 * there's nothing pending (the section should render nothing at all).
 */
export function pendingRequestsMessage(count: number): string | null {
  if (count <= 0) return null;
  return `You have ${count} pending request${count === 1 ? "" : "s"}`;
}
