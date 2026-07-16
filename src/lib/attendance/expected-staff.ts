import { supabase } from "@/integrations/supabase/client";
import { parseISO, getDay } from "date-fns";
import { getBranchAcademicYearIds } from "@/lib/school-holidays-scope";

// Kept in sync with StaffAttendance.tsx / Payroll.tsx helpers.
const STAFF_CLOSURE_EVENT_TYPES = new Set([
  "holiday", "reward_holiday", "public_holiday", "term_holiday",
  "term_break", "semester_break", "mid_term_holiday",
  "school_closure", "closure",
]);
function isStaffPaidClosure(h: any): boolean {
  if (!h) return false;
  if (h.is_public_holiday === true) return true;
  if (h.affects_attendance === true) return true;
  return STAFF_CLOSURE_EVENT_TYPES.has(h.event_type || "");
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Is this staff scheduled to work on the given date?
 * Mirrors Payroll.tsx getWorkDayFraction:
 *   - intern → Mon-Fri only
 *   - work_schedule explicit false/null → off
 *   - undefined weekend → off; undefined weekday → on
 *   - Saturday half-day still counts as scheduled
 */
export function isScheduledWorkDay(
  workSchedule: Record<string, any> | null | undefined,
  employmentType: string | null | undefined,
  date: Date,
): boolean {
  const dow = getDay(date);
  if (employmentType === "intern" && (dow === 0 || dow === 6)) return false;
  if (workSchedule) {
    const shift = workSchedule[String(dow)] !== undefined
      ? workSchedule[String(dow)]
      : workSchedule[DAY_NAMES[dow]];
    if (shift === null || shift === false) return false;
    if (shift === undefined) return !(dow === 0 || dow === 6);
    return true;
  }
  return !(dow === 0 || dow === 6);
}

export type ExpectedStatus =
  | "resigned"
  | "future"
  | "off_day"
  | "public_holiday"
  | "on_leave"
  | "present"
  | "completed"
  | "late"
  | "absent";

export interface ExpectedStaffRow {
  userId: string;
  name: string;
  email: string | null;
  status: ExpectedStatus;
  detail?: string;
  attendance?: any;
  isExcused: boolean;
  isExpected: boolean;
}

export interface ExpectedStaffSummary {
  active: number;
  expected: number;
  clockedIn: number;
  stillWorking: number;
  completed: number;
  late: number;
  notClockedIn: number;
  onLeave: number;
  publicHoliday: number;
  offDay: number;
  resigned: number;
  future: number;
}

export interface ExpectedStaffResult {
  rows: ExpectedStaffRow[];
  summary: ExpectedStaffSummary;
}

export async function resolveExpectedStaff(params: {
  branchId: string;
  date: string; // yyyy-MM-dd
}): Promise<ExpectedStaffResult> {
  const { branchId, date } = params;
  const dateObj = parseISO(date);

  const { data: memberships } = await supabase
    .from("branch_memberships").select("user_id").eq("branch_id", branchId);
  const userIds = [...new Set((memberships ?? []).map((m: any) => m.user_id).filter(Boolean))];
  if (userIds.length === 0) return emptyResult();

  const { data: roles } = await supabase
    .from("user_roles").select("user_id, role").in("user_id", userIds);
  const roleMap = new Map<string, string[]>();
  (roles ?? []).forEach((r: any) => {
    const arr = roleMap.get(r.user_id) ?? [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });
  const staffIds = userIds.filter(uid => {
    const r = roleMap.get(uid) ?? [];
    return r.length === 0 || !r.every(x => x === "parent");
  });
  if (staffIds.length === 0) return emptyResult();

  const [{ data: profiles }, { data: sps }] = await Promise.all([
    supabase.from("profiles").select("id, first_name, last_name, email").in("id", staffIds),
    supabase.from("staff_profiles")
      .select("user_id, employment_status, employment_type, employment_start_date, last_working_date, work_schedule, exclude_from_payroll, is_active")
      .in("user_id", staffIds),
  ]);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const spMap = new Map((sps ?? []).map((sp: any) => [sp.user_id, sp]));

  const activeIds = staffIds.filter(uid => spMap.get(uid)?.exclude_from_payroll !== true);
  if (activeIds.length === 0) return emptyResult();

  const yearIds = await getBranchAcademicYearIds(branchId);
  const [{ data: shRange }, { data: shExact }, { data: beRange }, { data: beExact }] = await Promise.all([
    supabase.from("school_holidays")
      .select("event_name, event_type, is_public_holiday, affects_attendance, end_date")
      .in("academic_year_id", yearIds)
      .lte("event_date", date).gte("end_date", date),
    supabase.from("school_holidays")
      .select("event_name, event_type, is_public_holiday, affects_attendance")
      .in("academic_year_id", yearIds)
      .eq("event_date", date).is("end_date", null),
    supabase.from("branch_events")
      .select("event_name, event_type, affects_attendance, end_date")
      .eq("branch_id", branchId).eq("affects_attendance", true)
      .lte("event_date", date).gte("end_date", date),
    supabase.from("branch_events")
      .select("event_name, event_type, affects_attendance")
      .eq("branch_id", branchId).eq("affects_attendance", true)
      .eq("event_date", date).is("end_date", null),
  ]);
  const holidayName = [
    ...(shRange ?? []), ...(shExact ?? []), ...(beRange ?? []), ...(beExact ?? []),
  ].find(isStaffPaidClosure)?.event_name as string | undefined;

  const { data: leaves } = await supabase
    .from("leave_requests")
    .select("user_id, leave_type, start_date, end_date, status")
    .in("user_id", activeIds)
    .eq("status", "approved")
    .lte("start_date", date)
    .gte("end_date", date);
  const leaveMap = new Map<string, string>();
  (leaves ?? []).forEach((l: any) => leaveMap.set(l.user_id, l.leave_type));

  const { data: attRows } = await supabase
    .from("staff_attendance")
    .select("user_id, clock_in, clock_out")
    .eq("branch_id", branchId)
    .eq("date", date);
  const attMap = new Map<string, any>();
  (attRows ?? []).forEach((a: any) => attMap.set(a.user_id, a));

  const rows: ExpectedStaffRow[] = activeIds.map(uid => {
    const p: any = profileMap.get(uid) ?? {};
    const sp: any = spMap.get(uid) ?? {};
    const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || (p.email ?? "Unknown");
    const base = { userId: uid, name, email: p.email ?? null };

    // 1. Resigned / terminated (before or on `date`, unless last_working_date extends coverage)
    const status = sp.employment_status;
    const lwd = sp.last_working_date;
    const inactiveStatus = status === "resigned" || status === "terminated" || status === "archived" || sp.is_active === false;
    if (inactiveStatus && (!lwd || lwd < date)) {
      return { ...base, status: "resigned" as const, isExcused: true, isExpected: false };
    }

    // 2. Future hire
    if (sp.employment_start_date && sp.employment_start_date > date) {
      return { ...base, status: "future" as const, isExcused: true, isExpected: false };
    }

    // 3. Weekly off
    if (!isScheduledWorkDay(sp.work_schedule, sp.employment_type, dateObj)) {
      return { ...base, status: "off_day" as const, isExcused: true, isExpected: false };
    }

    // 4. Public holiday / paid closure
    if (holidayName) {
      return { ...base, status: "public_holiday" as const, detail: holidayName, isExcused: true, isExpected: false };
    }

    // 5. Approved leave
    const leaveType = leaveMap.get(uid);
    if (leaveType) {
      return { ...base, status: "on_leave" as const, detail: leaveType, isExcused: true, isExpected: false };
    }

    // 6. Attendance record
    const att = attMap.get(uid);
    if (att?.clock_in) {
      if (att.clock_out) return { ...base, status: "completed" as const, attendance: att, isExcused: false, isExpected: true };
      return { ...base, status: "present" as const, attendance: att, isExcused: false, isExpected: true };
    }

    // 7. Absent
    return { ...base, status: "absent" as const, isExcused: false, isExpected: true };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const summary: ExpectedStaffSummary = {
    active: activeIds.length,
    expected: rows.filter(r => r.isExpected).length,
    clockedIn: rows.filter(r => r.status === "present" || r.status === "completed" || r.status === "late").length,
    stillWorking: rows.filter(r => r.status === "present").length,
    completed: rows.filter(r => r.status === "completed").length,
    late: rows.filter(r => r.status === "late").length,
    notClockedIn: rows.filter(r => r.status === "absent").length,
    onLeave: rows.filter(r => r.status === "on_leave").length,
    publicHoliday: rows.filter(r => r.status === "public_holiday").length,
    offDay: rows.filter(r => r.status === "off_day").length,
    resigned: rows.filter(r => r.status === "resigned").length,
    future: rows.filter(r => r.status === "future").length,
  };

  return { rows, summary };
}

function emptyResult(): ExpectedStaffResult {
  return {
    rows: [],
    summary: {
      active: 0, expected: 0, clockedIn: 0, stillWorking: 0, completed: 0, late: 0,
      notClockedIn: 0, onLeave: 0, publicHoliday: 0, offDay: 0, resigned: 0, future: 0,
    },
  };
}

export const STATUS_LABEL: Record<ExpectedStatus, string> = {
  resigned: "Resigned",
  future: "Future hire",
  off_day: "Off day",
  public_holiday: "Public holiday",
  on_leave: "On leave",
  present: "Working",
  completed: "Completed",
  late: "Late",
  absent: "Not clocked in",
};
