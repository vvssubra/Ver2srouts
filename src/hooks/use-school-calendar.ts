import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SchoolHoliday = {
  id: string;
  event_date: string;
  end_date: string | null;
  event_name: string;
  is_public_holiday: boolean;
  affects_attendance: boolean;
  event_type: string;
};

/**
 * Pulls the active academic year for a branch and all holidays/events
 * within it. Used to compute "expected school days" for attendance.
 */
export function useSchoolCalendar(branchId: string | undefined | null) {
  return useQuery({
    queryKey: ["school-calendar", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data: years } = await supabase
        .from("academic_years")
        .select("id, year_name, start_date, end_date, is_active")
        .eq("branch_id", branchId!)
        .order("start_date", { ascending: false });
      const list = years ?? [];
      // Active year first, otherwise the most recent one that contains "now"
      const today = new Date().toISOString().slice(0, 10);
      const year =
        list.find((y: any) => y.is_active) ??
        list.find((y: any) => y.start_date <= today && today <= y.end_date) ??
        list[0] ??
        null;

      if (!year) return { year: null as any, holidays: [] as SchoolHoliday[] };

      const { data: hs } = await supabase
        .from("school_holidays")
        .select("id, event_date, end_date, event_name, is_public_holiday, affects_attendance, event_type")
        .eq("academic_year_id", year.id);
      return { year, holidays: (hs ?? []) as SchoolHoliday[] };
    },
  });
}

/**
 * Event types that always close the school regardless of the
 * `affects_attendance` flag (which is sometimes saved incorrectly).
 */
const CLOSURE_EVENT_TYPES = new Set([
  "holiday",
  "public_holiday",
  "term_holiday",
  "term_break",
  "semester_break",
  "mid_term_holiday",
  "school_closure",
  "closure",
]);

/** A row is treated as "school closed" if ANY of these are true. */
export function isClosureEvent(h: SchoolHoliday): boolean {
  if (h.affects_attendance) return true;
  if (h.is_public_holiday) return true;
  if (h.event_type && CLOSURE_EVENT_TYPES.has(h.event_type)) return true;
  return false;
}

/**
 * Returns the map of date strings (yyyy-MM-dd) blocked by holidays/breaks,
 * expanded across event ranges. Each date carries the source row so the
 * UI can show "Mid Term Holiday" etc.
 */
export function holidaySetFrom(holidays: SchoolHoliday[]): Map<string, SchoolHoliday> {
  const out = new Map<string, SchoolHoliday>();
  for (const h of holidays) {
    if (!isClosureEvent(h)) continue;
    const start = new Date(h.event_date);
    const end = h.end_date ? new Date(h.end_date) : start;
    const cur = new Date(start);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      // Don't overwrite a single-day public holiday with a long break
      if (!out.has(key)) out.set(key, h);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}

/** Multi-day closures (>1 day) that overlap a date range, for UI chips. */
export function activeBreaksIn(
  holidays: SchoolHoliday[],
  rangeStart: Date,
  rangeEnd: Date,
): SchoolHoliday[] {
  const s = rangeStart.getTime();
  const e = rangeEnd.getTime();
  return holidays
    .filter(isClosureEvent)
    .filter((h) => !!h.end_date && h.end_date !== h.event_date)
    .filter((h) => {
      const hs = new Date(h.event_date).getTime();
      const he = new Date(h.end_date as string).getTime();
      return he >= s && hs <= e;
    });
}