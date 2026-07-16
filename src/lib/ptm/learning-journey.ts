import { supabase } from "@/integrations/supabase/client";

export type JourneySource = "journey" | "observation";

export type JourneyTimelineItem = {
  key: string;              // unique row key: `${source}:${id}`
  source: JourneySource;
  id: string;
  date: string;             // ISO date
  title: string;
  domain: string | null;
  tpLevel: "TP1" | "TP2" | "TP3" | null;
  teacherNote: string | null;
  entryType?: string | null;
};

/**
 * Load Learning Journey timeline for a student within the given term range.
 * Combines `daily_learning_journey_entries` (activity/observation records the
 * teacher wrote) with `student_observations` (which carry TP1/TP2/TP3 levels).
 * Nothing is duplicated or recalculated — we read as-is.
 */
export async function loadJourneyTimeline(params: {
  studentId: string;
  termStart: string; // yyyy-mm-dd
  termEnd: string;   // yyyy-mm-dd
}): Promise<JourneyTimelineItem[]> {
  const { studentId, termStart, termEnd } = params;
  const startTs = `${termStart}T00:00:00`;
  const endTs   = `${termEnd}T23:59:59`;

  const [journeyRes, obsRes] = await Promise.all([
    supabase
      .from("daily_learning_journey_entries")
      .select("id, created_at, title, teacher_note, entry_type, development_domains(name)")
      .eq("student_id", studentId)
      .gte("created_at", startTs)
      .lte("created_at", endTs)
      .order("created_at", { ascending: true }),
    supabase
      .from("student_observations")
      .select("id, observed_at, proficiency_level, notes, curriculum_standards(code, title_ms, title_en)")
      .eq("student_id", studentId)
      .gte("observed_at", termStart)
      .lte("observed_at", termEnd)
      .order("observed_at", { ascending: true }),
  ]);

  const items: JourneyTimelineItem[] = [];

  for (const j of (journeyRes.data ?? []) as any[]) {
    items.push({
      key: `journey:${j.id}`,
      source: "journey",
      id: j.id,
      date: (j.created_at || "").slice(0, 10),
      title: j.title || "Learning Journey entry",
      domain: j.development_domains?.name ?? null,
      tpLevel: null,
      teacherNote: j.teacher_note ?? null,
      entryType: j.entry_type ?? null,
    });
  }
  for (const o of (obsRes.data ?? []) as any[]) {
    const std = o.curriculum_standards;
    const title = std?.title_en || std?.title_ms || std?.code || "Curriculum observation";
    const tp = ["TP1", "TP2", "TP3"].includes(o.proficiency_level) ? o.proficiency_level : null;
    items.push({
      key: `observation:${o.id}`,
      source: "observation",
      id: o.id,
      date: o.observed_at,
      title,
      domain: std?.code ? `Standard ${std.code}` : null,
      tpLevel: tp,
      teacherNote: o.notes ?? null,
      entryType: "observation",
    });
  }

  // Chronological by default
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

/** Selection payload sent to the edge function. */
export type JourneySelectionPayload = {
  items: Array<Pick<JourneyTimelineItem, "key" | "source" | "id" | "date" | "title" | "domain" | "tpLevel" | "teacherNote" | "entryType">>;
};