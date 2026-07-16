import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, parseISO } from "date-fns";

interface AutoPublishOptions {
  classId: string;
  branchId: string;
  templateSlots: any[];
  targetMonths?: Date[]; // defaults to current + next month
}

/**
 * Expands a single-date or date-range row into an array of date strings.
 */
function expandDateRange(eventDate: string, endDate?: string | null): string[] {
  if (!endDate) return [eventDate];
  const start = parseISO(eventDate);
  const end = parseISO(endDate);
  if (end < start) return [eventDate];
  return eachDayOfInterval({ start, end }).map(d => format(d, "yyyy-MM-dd"));
}

/**
 * Fetches holiday dates (school_holidays + branch_events with affects_attendance)
 * for a given date range and branch. Supports multi-day date ranges.
 */
export async function fetchHolidayDates(branchId: string, rangeStart: string, rangeEnd: string): Promise<{ dates: Set<string>; holidays: any[] }> {
  const [{ data: schoolHolidays }, { data: branchEvents }] = await Promise.all([
    supabase
      .from("school_holidays")
      .select("event_date, end_date, event_name, event_type, is_public_holiday")
      .or(`and(event_date.lte.${rangeEnd},end_date.gte.${rangeStart}),and(event_date.gte.${rangeStart},event_date.lte.${rangeEnd})`),
    supabase
      .from("branch_events")
      .select("event_date, end_date, event_name, event_type, affects_attendance")
      .eq("branch_id", branchId)
      .eq("affects_attendance", true)
      .or(`and(event_date.lte.${rangeEnd},end_date.gte.${rangeStart}),and(event_date.gte.${rangeStart},event_date.lte.${rangeEnd})`),
  ]);

  // For timetable: skip holiday, reward_holiday, term_holiday (school closed for students)
  const SCHOOL_CLOSED_TYPES = ["holiday", "reward_holiday", "term_holiday"];
  const filteredSchoolHolidays = (schoolHolidays ?? []).filter((h: any) => {
    const et = h.event_type || (h.is_public_holiday ? "holiday" : "event");
    return SCHOOL_CLOSED_TYPES.includes(et);
  });
  const filteredBranchEvents = (branchEvents ?? []).filter((e: any) => SCHOOL_CLOSED_TYPES.includes(e.event_type || ""));
  const allHolidays = [
    ...filteredSchoolHolidays,
    ...filteredBranchEvents.map((e: any) => ({ event_date: e.event_date, end_date: e.end_date, event_name: e.event_name })),
  ];

  const dates = new Set<string>();
  allHolidays.forEach((h: any) => {
    expandDateRange(h.event_date, h.end_date).forEach(d => dates.add(d));
  });
  return { dates, holidays: allHolidays };
}

/**
 * Auto-publishes a weekly template to specified months.
 * - Skips holidays and weekends
 * - Preserves manually modified slots (is_modified = true)
 * - Returns total slots created
 */
export async function autoPublishTemplate({
  classId,
  branchId,
  templateSlots,
  targetMonths,
}: AutoPublishOptions): Promise<number> {
  if (templateSlots.length === 0) return 0;

  // Default: publish the template across the next 12 months so admins set up once per year.
  // Manual overrides (is_modified=true) are preserved on every re-run.
  const months =
    targetMonths ??
    Array.from({ length: 12 }, (_, i) => addMonths(new Date(), i));
  let totalCreated = 0;

  for (const month of months) {
    const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

    // Get holidays for this month
    const { dates: holidayDates } = await fetchHolidayDates(branchId, monthStart, monthEnd);

    // Get weekdays in this month (exclude Sat/Sun)
    const allDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    const weekdays = allDays.filter(d => getDay(d) !== 0 && getDay(d) !== 6);

    // Delete only non-modified slots for this month (preserve manual overrides)
    await supabase
      .from("daily_timetable_slots")
      .delete()
      .eq("class_id", classId)
      .eq("is_modified", false)
      .gte("slot_date", monthStart)
      .lte("slot_date", monthEnd);

    // Get remaining modified slots to avoid duplicates
    const { data: existingModified } = await supabase
      .from("daily_timetable_slots")
      .select("slot_date, start_time")
      .eq("class_id", classId)
      .eq("is_modified", true)
      .gte("slot_date", monthStart)
      .lte("slot_date", monthEnd);

    const modifiedKeys = new Set(
      (existingModified ?? []).map((s: any) => `${s.slot_date}_${s.start_time}`)
    );

    const rows: any[] = [];
    const seen = new Set<string>();
    for (const day of weekdays) {
      const dateStr = format(day, "yyyy-MM-dd");
      if (holidayDates.has(dateStr)) continue;

      const jsDay = getDay(day); // 0=Sun,1=Mon...6=Sat
      const daySlots = templateSlots.filter((s: any) => s.day_of_week === jsDay);

      for (const slot of daySlots) {
        const key = `${dateStr}_${slot.start_time}`;
        if (modifiedKeys.has(key)) continue; // skip — user manually changed this
        const dedupeKey = `${dateStr}_${slot.start_time}_${slot.subject_name}`;
        if (seen.has(dedupeKey)) continue; // skip duplicate (class,date,time,subject) — matches table unique constraint
        seen.add(dedupeKey);

        rows.push({
          class_id: classId,
          branch_id: branchId,
          slot_date: dateStr,
          start_time: slot.start_time,
          end_time: slot.end_time,
          subject_name: slot.subject_name,
          source_slot_id: slot.id,
          is_modified: false,
          event_name: slot.event_name || null,
          event_description: slot.event_description || null,
          event_agenda: slot.event_agenda || [],
          is_parallel_group: slot.is_parallel_group || false,
          parallel_group_label: slot.parallel_group_label || null,
        });
      }
    }

    // Upsert in batches of 100 — ignore duplicates so a re-run never fails on the unique constraint
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase
        .from("daily_timetable_slots")
        .upsert(batch, {
          onConflict: "class_id,slot_date,start_time,subject_name",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }

    totalCreated += rows.length;
  }

  return totalCreated;
}
