import { supabase } from "@/integrations/supabase/client";

export type HighlightItem = {
  key: string;              // `update:${id}`
  update_id: string;
  date: string;             // ISO
  caption: string;
  domain: string;
  milestone: boolean;
  portfolio: boolean;
  photo_url: string | null;
  extra_photos: string[];
};

/**
 * Load teacher-recorded milestones and learning photos for a student within
 * the given PTM term range. Reads directly from `child_updates` (source of
 * truth for teacher-shared moments) — nothing is fabricated or recomputed.
 * Only records with at least one photo AND (milestone_flag OR
 * portfolio_candidate) are returned so the review list only shows
 * teacher-approved highlights.
 */
export async function loadHighlights(params: {
  studentId: string;
  termStart: string;
  termEnd: string;
}): Promise<HighlightItem[]> {
  const { studentId, termStart, termEnd } = params;

  const { data: tags } = await supabase
    .from("child_update_students")
    .select("update_id")
    .eq("student_id", studentId);
  const ids = (tags ?? []).map((r: any) => r.update_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("child_updates")
    .select(
      "id, created_at, activity_date, caption, parent_summary, ai_learning_story, milestone_flag, portfolio_candidate, subject_name, status, development_domains(name), child_update_media(url, kind, sort_order)"
    )
    .in("id", ids)
    .eq("status", "shared")
    .gte("activity_date", termStart)
    .lte("activity_date", termEnd)
    .order("activity_date", { ascending: false });

  const rows = (data ?? []) as any[];
  const items: HighlightItem[] = [];
  for (const u of rows) {
    const photos = (u.child_update_media || [])
      .filter((m: any) => m.kind === "photo" || m.kind === "image" || !m.kind)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((m: any) => m.url)
      .filter(Boolean);
    if (photos.length === 0) continue;
    const milestone = !!u.milestone_flag;
    const portfolio = !!u.portfolio_candidate;
    if (!milestone && !portfolio) continue;
    items.push({
      key: `update:${u.id}`,
      update_id: u.id,
      date: u.activity_date || (u.created_at || "").slice(0, 10),
      caption: u.caption || u.parent_summary || u.ai_learning_story || "",
      domain: u.development_domains?.name || u.subject_name || "General",
      milestone,
      portfolio,
      photo_url: photos[0],
      extra_photos: photos.slice(1),
    });
  }
  // Milestones first, then most recent
  items.sort((a, b) => {
    if (a.milestone !== b.milestone) return a.milestone ? -1 : 1;
    return (b.date || "").localeCompare(a.date || "");
  });
  return items;
}

export type HighlightSelection = {
  key: string;
  update_id: string;
  date: string;
  caption: string;
  domain: string;
  milestone: boolean;
  photo_url: string | null;
};