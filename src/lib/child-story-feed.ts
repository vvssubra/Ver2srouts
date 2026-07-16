import { supabase } from "@/integrations/supabase/client";

export type StorySource = "observation" | "activity" | "journey" | "update";

export interface StoryVideo {
  url: string;
  thumbnailUrl?: string | null;
}

export interface StoryItem {
  id: string;
  source: StorySource;
  date: string; // yyyy-MM-dd
  createdAt: string;
  title: string;
  body?: string | null;
  photos: string[];
  videos?: StoryVideo[];
  area?: string | null;
  proficiency?: string | null;
  standardCode?: string | null;
  slotTime?: string | null;
  subject?: string | null;
  albumTitle?: string | null;
  raw: any;
}

/**
 * Unified parent-facing story feed for one child.
 * Merges observations, learning activities and legacy journey entries
 * into one chronologically sorted stream.
 */
export async function fetchChildStoryFeed(
  studentId: string,
  opts: { fromDate?: string; toDate?: string; limit?: number } = {}
): Promise<StoryItem[]> {
  if (!studentId) return [];
  const limit = opts.limit ?? 60;

  // 1. Observations shared with parent
  const obsQuery = supabase
    .from("student_observations")
    .select(
      "id, observed_at, created_at, notes, ai_learning_story, media_url, evidence_url, proficiency_level, timetable_slot_id, curriculum_standards(code, title_ms, title_en, learning_area_id), student_observation_media(id, media_url, media_type, thumbnail_url, caption, sort_order)"
    )
    .eq("student_id", studentId)
    .eq("is_shared_with_parent", true)
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (opts.fromDate) obsQuery.gte("observed_at", opts.fromDate);
  if (opts.toDate) obsQuery.lte("observed_at", opts.toDate);

  // 2. Learning activities (class-wide) tagged for this student
  const tagQuery = supabase
    .from("learning_activity_students")
    .select("activity_id")
    .eq("student_id", studentId);

  // 3. Legacy daily learning journey entries
  const jrnQuery = supabase
    .from("daily_learning_journey_entries")
    .select(
      "id, created_at, title, parent_summary, teacher_note, milestone_flag, development_domains(name), learning_journey_media(media_url, media_type, caption)"
    )
    .eq("student_id", studentId)
    .eq("visible_to_parent", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  // 4. New consolidated child_updates feed
  const updTagQuery = supabase
    .from("child_update_students")
    .select("update_id")
    .eq("student_id", studentId);

  const [obsRes, tagRes, jrnRes, updTagRes] = await Promise.all([
    obsQuery,
    tagQuery,
    jrnQuery,
    updTagQuery,
  ]);

  let updates: any[] = [];
  const updateIds = (updTagRes.data ?? []).map((r: any) => r.update_id);
  if (updateIds.length) {
    const updQ = supabase
      .from("child_updates")
      .select(
        "id, created_at, caption, parent_summary, ai_learning_story, proficiency_level, development_domains(name), child_update_media(id, url, kind, thumbnail_url, sort_order)"
      )
      .in("id", updateIds)
      .eq("visible_to_parent", true)
      .eq("status", "shared")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.fromDate) updQ.gte("created_at", opts.fromDate);
    if (opts.toDate) updQ.lte("created_at", opts.toDate);
    const { data } = await updQ;
    updates = data ?? [];
  }

  let activities: any[] = [];
  const activityIds = (tagRes.data ?? []).map((r: any) => r.activity_id);
  if (activityIds.length) {
    const actQ = supabase
      .from("learning_activities")
      .select(
        "id, title, description, activity_date, created_at, learning_albums(title), development_domains(name), learning_activity_media(id, media_url, media_type, thumbnail_url, caption, sort_order)"
      )
      .in("id", activityIds)
      .eq("visible_to_parents", true)
      .order("activity_date", { ascending: false })
      .limit(limit);
    if (opts.fromDate) actQ.gte("activity_date", opts.fromDate);
    if (opts.toDate) actQ.lte("activity_date", opts.toDate);
    const { data } = await actQ;
    activities = data ?? [];
  }

  const items: StoryItem[] = [];

  for (const o of obsRes.data ?? []) {
    const extras = ((o as any).student_observation_media ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const photoSet = new Set<string>();
    const videoMap = new Map<string, StoryVideo>();
    if (o.media_url) photoSet.add(o.media_url);
    if (o.evidence_url && !o.evidence_url.toLowerCase().endsWith(".pdf")) photoSet.add(o.evidence_url);
    for (const m of extras) {
      if (!m.media_url) continue;
      if (m.media_type === "video") videoMap.set(m.media_url, { url: m.media_url, thumbnailUrl: m.thumbnail_url ?? null });
      else photoSet.add(m.media_url);
    }
    const photos = Array.from(photoSet);
    const videos = Array.from(videoMap.values());
    items.push({
      id: `obs-${o.id}`,
      source: "observation",
      date: o.observed_at,
      createdAt: o.created_at,
      title: (o as any).curriculum_standards?.title_ms || "Learning moment",
      body: o.ai_learning_story || o.notes,
      photos,
      videos,
      area: null,
      proficiency: o.proficiency_level,
      standardCode: (o as any).curriculum_standards?.code ?? null,
      slotTime: null,
      subject: null,
      raw: o,
    });
  }

  for (const a of activities) {
    const media = (a.learning_activity_media ?? []).sort((x: any, y: any) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    const photos = media.filter((m: any) => m.media_type !== "video").map((m: any) => m.media_url);
    const videos = media.filter((m: any) => m.media_type === "video").map((m: any) => ({ url: m.media_url, thumbnailUrl: m.thumbnail_url ?? null }));
    items.push({
      id: `act-${a.id}`,
      source: "activity",
      date: a.activity_date,
      createdAt: a.created_at,
      title: a.title,
      body: a.description,
      photos,
      videos,
      area: a.development_domains?.name ?? null,
      albumTitle: a.learning_albums?.title ?? null,
      raw: a,
    });
  }

  for (const j of jrnRes.data ?? []) {
    const journeyMedia = j.learning_journey_media ?? [];
    const photos = journeyMedia.filter((m: any) => m.media_type !== "video").map((m: any) => m.media_url).filter(Boolean);
    const videos = journeyMedia.filter((m: any) => m.media_type === "video" && m.media_url).map((m: any) => ({ url: m.media_url, thumbnailUrl: m.thumbnail_url ?? null }));
    items.push({
      id: `jrn-${j.id}`,
      source: "journey",
      date: (j.created_at ?? "").slice(0, 10),
      createdAt: j.created_at,
      title: j.title,
      body: j.parent_summary || j.teacher_note,
      photos,
      videos,
      area: (j as any).development_domains?.name ?? null,
      raw: j,
    });
  }

  for (const u of updates) {
    const media = ((u as any).child_update_media ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const photos = media.filter((m: any) => m.kind !== "video").map((m: any) => m.url).filter(Boolean);
    const videos = media.filter((m: any) => m.kind === "video" && m.url).map((m: any) => ({ url: m.url, thumbnailUrl: m.thumbnail_url ?? null }));
    items.push({
      id: `upd-${u.id}`,
      source: "update",
      date: (u.created_at ?? "").slice(0, 10),
      createdAt: u.created_at,
      title: u.caption || "Daily update",
      body: u.parent_summary || u.ai_learning_story || u.caption,
      photos,
      videos,
      area: (u as any).development_domains?.name ?? null,
      proficiency: u.proficiency_level ?? null,
      raw: u,
    });
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return items.slice(0, limit);
}