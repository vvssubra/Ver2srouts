import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Monday (ISO week start) for a given date, formatted as yyyy-MM-dd. */
export function isoWeekStart(d: Date = new Date()): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay() || 7; // Sun=0 -> 7
  x.setDate(x.getDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

export type ChildNextFocus = {
  id: string;
  branch_id: string;
  class_id: string | null;
  student_id: string;
  weekly_plan_id: string | null;
  source: string;
  focus_title: string;
  focus_description: string | null;
  domain_ids_json: any;
  skill_labels_json: any;
  vocabulary_json: any;
  home_support_json: any;
  observation_cues_json: any;
  status: "suggested" | "teacher_reviewed" | "approved" | "archived";
  visible_to_parent: boolean;
  week_starting: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

/** Current-week child_next_focus row (latest if duplicates ever exist). */
export function useChildNextFocus(studentId?: string | null, opts?: { parentVisibleOnly?: boolean }) {
  const week = isoWeekStart();
  return useQuery({
    queryKey: ["child-next-focus", studentId, week, !!opts?.parentVisibleOnly],
    enabled: !!studentId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("child_next_focus")
        .select("*")
        .eq("student_id", studentId!)
        .eq("week_starting", week)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (opts?.parentVisibleOnly) q = q.eq("visible_to_parent", true);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? [])[0] as ChildNextFocus) ?? null;
    },
  });
}

/** Count of evidence records linked to a focus row. Parent-safe (count only). */
export function useChildFocusEvidenceCount(focusId?: string | null) {
  return useQuery({
    queryKey: ["child-next-focus-evidence-count", focusId],
    enabled: !!focusId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("child_next_focus_evidence")
        .select("id", { count: "exact", head: true })
        .eq("focus_id", focusId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}