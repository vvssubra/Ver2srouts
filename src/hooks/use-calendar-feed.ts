import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CalendarEventKind =
  | "public_holiday"
  | "term_break"
  | "replacement_holiday"
  | "staff_training"
  | "school_activity"
  | "ptm_day"
  | "assessment_window"
  | "normal";

export type CalendarFeedRow = {
  source_id: string;
  source_table: "school_holidays" | "branch_events";
  branch_id: string | null;
  academic_year_id: string | null;
  start_date: string;
  end_date: string;
  name: string;
  event_kind: CalendarEventKind;
  is_paid: boolean | null;
  affects_attendance: boolean | null;
  school_closed: boolean;
};

export const EVENT_KIND_META: Record<CalendarEventKind, {
  label: string;
  badge: string;
  dot: string;
  closesSchool: boolean;
}> = {
  public_holiday:      { label: "Public Holiday",   badge: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive",     closesSchool: true  },
  term_break:          { label: "Term Break",       badge: "bg-violet-100 text-violet-800 border-violet-300",         dot: "bg-violet-500",      closesSchool: true  },
  replacement_holiday: { label: "Replacement Day",  badge: "bg-amber-100 text-amber-800 border-amber-300",            dot: "bg-amber-500",       closesSchool: true  },
  staff_training:      { label: "Staff Training",   badge: "bg-teal-100 text-teal-800 border-teal-300",               dot: "bg-teal-500",        closesSchool: true  },
  school_activity:     { label: "Activity Day",     badge: "bg-primary/15 text-primary border-primary/30",            dot: "bg-primary",         closesSchool: false },
  ptm_day:             { label: "Parent Meeting",   badge: "bg-blue-100 text-blue-800 border-blue-300",               dot: "bg-blue-500",        closesSchool: false },
  assessment_window:   { label: "Assessment",       badge: "bg-orange-100 text-orange-800 border-orange-300",         dot: "bg-orange-500",      closesSchool: false },
  normal:              { label: "Normal",           badge: "bg-muted text-muted-foreground border-border",            dot: "bg-muted-foreground",closesSchool: false },
};

/**
 * Unified calendar feed — the ONLY way pages should read calendar data.
 * Reads from public.v_school_calendar (UNION of school_holidays + branch_events).
 */
export function useCalendarFeed(
  branchId: string | undefined | null,
  rangeStart: string,
  rangeEnd: string,
) {
  return useQuery({
    queryKey: ["calendar-feed", branchId, rangeStart, rangeEnd],
    enabled: !!branchId,
    queryFn: async (): Promise<CalendarFeedRow[]> => {
      const { data, error } = await supabase
        .from("v_school_calendar" as any)
        .select("*")
        .or(`branch_id.eq.${branchId},branch_id.is.null`)
        .lte("start_date", rangeEnd)
        .gte("end_date", rangeStart);
      if (error) throw error;
      return (data ?? []) as unknown as CalendarFeedRow[];
    },
  });
}

/** Expand multi-day rows into a date -> row map for fast day-cell lookup. */
export function expandFeedByDay(rows: CalendarFeedRow[]): Map<string, CalendarFeedRow[]> {
  const out = new Map<string, CalendarFeedRow[]>();
  for (const r of rows) {
    const s = new Date(r.start_date);
    const e = new Date(r.end_date);
    const cur = new Date(s);
    while (cur <= e) {
      const k = cur.toISOString().slice(0, 10);
      const arr = out.get(k) ?? [];
      arr.push(r);
      out.set(k, arr);
      cur.setDate(cur.getDate() + 1);
    }
  }
  return out;
}