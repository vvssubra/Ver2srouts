// Shared assessment + progress context helper for AI lesson planning.
// Pulls baseline (earliest) and latest (most recent) assessment per child
// from `baseline_assessments`, plus the current progress rollup from
// `v_child_progress_domain_rollup`, and returns a compact summary safe to
// inject into a system prompt.

type SupabaseClient = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;

export type AssessmentContext = {
  student_count: number;
  assessed_count: number;
  // Average baseline vs latest score per domain across the cohort.
  domain_trends: Array<{
    domain: string;
    baseline_avg: number | null;
    latest_avg: number | null;
    delta: number | null;
    trend: "growing" | "regression" | "flat" | "no_data";
  }>;
  strongest_domains: string[];
  growing_domains: string[];
  needs_support_domains: string[];
  // Recent teacher notes from latest assessment, truncated.
  recent_notes: string[];
  // Per-domain skill-status rollup from child_skill_progress.
  progress_rollup: Array<{
    domain: string;
    observed_skills: number;
    secure: number;
    developing: number;
    emerging: number;
    avg_status_score: number | null;
  }>;
};

function avg(nums: Array<number | null | undefined>): number | null {
  const xs = nums.filter((n): n is number => typeof n === "number" && !Number.isNaN(n));
  if (!xs.length) return null;
  return Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2));
}

function domainScores(row: any): Record<string, number> {
  const ds = (row?.domain_scores && typeof row.domain_scores === "object") ? row.domain_scores : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ds)) {
    if (typeof v === "number") out[k] = v;
  }
  // Legacy aggregate columns fallback (only if domain_scores empty).
  if (Object.keys(out).length === 0) {
    if (typeof row?.motor_skills_score === "number")   out.PM = row.motor_skills_score;
    if (typeof row?.language_score === "number")       out.CL = row.language_score;
    if (typeof row?.socio_emotional_score === "number") out.SE = row.socio_emotional_score;
    if (typeof row?.cognitive_score === "number")      out.NT = row.cognitive_score;
  }
  return out;
}

/**
 * Build an AssessmentContext for the given student ids.
 * Caller should usually pass the active roster of a class.
 */
export async function buildAssessmentContext(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<AssessmentContext> {
  const empty: AssessmentContext = {
    student_count: studentIds.length,
    assessed_count: 0,
    domain_trends: [],
    strongest_domains: [],
    growing_domains: [],
    needs_support_domains: [],
    recent_notes: [],
    progress_rollup: [],
  };
  if (!studentIds.length) return empty;

  const [{ data: assessments }, { data: rollup }] = await Promise.all([
    supabase
      .from("baseline_assessments")
      .select("student_id, date_evaluated, assessment_type, domain_scores, motor_skills_score, language_score, socio_emotional_score, cognitive_score, teacher_notes")
      .in("student_id", studentIds)
      .order("date_evaluated", { ascending: true }),
    supabase
      .from("v_child_progress_domain_rollup" as any)
      .select("student_id, domain_code, domain_name, observed_skill_count, secure_count, developing_count, emerging_count, average_status_score")
      .in("student_id", studentIds),
  ]);

  // Per-student baseline (first) + latest (last) assessment.
  const first = new Map<string, any>();
  const last  = new Map<string, any>();
  for (const a of (assessments ?? []) as any[]) {
    if (!first.has(a.student_id)) first.set(a.student_id, a);
    last.set(a.student_id, a);
  }

  // Aggregate baseline vs latest per domain across the cohort.
  const baselineByDomain: Record<string, number[]> = {};
  const latestByDomain:   Record<string, number[]> = {};
  for (const sid of studentIds) {
    const b = first.get(sid);
    const l = last.get(sid);
    if (b) {
      for (const [k, v] of Object.entries(domainScores(b))) {
        (baselineByDomain[k] ||= []).push(v);
      }
    }
    if (l && l !== b) {
      for (const [k, v] of Object.entries(domainScores(l))) {
        (latestByDomain[k] ||= []).push(v);
      }
    }
  }

  const allDomains = new Set([...Object.keys(baselineByDomain), ...Object.keys(latestByDomain)]);
  const domain_trends: AssessmentContext["domain_trends"] = [];
  for (const d of allDomains) {
    const bAvg = avg(baselineByDomain[d] ?? []);
    const lAvg = avg(latestByDomain[d] ?? []);
    const delta = bAvg !== null && lAvg !== null ? Number((lAvg - bAvg).toFixed(2)) : null;
    let trend: AssessmentContext["domain_trends"][number]["trend"] = "no_data";
    if (delta === null) trend = "no_data";
    else if (delta > 0.25) trend = "growing";
    else if (delta < -0.25) trend = "regression";
    else trend = "flat";
    domain_trends.push({ domain: d, baseline_avg: bAvg, latest_avg: lAvg, delta, trend });
  }

  // Strongest = highest latest_avg; growing = positive delta; needs support = lowest latest or regression.
  const withLatest = domain_trends.filter((t) => t.latest_avg !== null);
  const sortedByLatest = [...withLatest].sort((a, b) => (b.latest_avg ?? 0) - (a.latest_avg ?? 0));
  const strongest_domains = sortedByLatest.slice(0, 3).map((t) => t.domain);
  const growing_domains = domain_trends
    .filter((t) => t.trend === "growing")
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 3)
    .map((t) => t.domain);
  const needs_support_domains = [
    ...domain_trends.filter((t) => t.trend === "regression").map((t) => t.domain),
    ...sortedByLatest.slice(-3).reverse().map((t) => t.domain),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);

  const recent_notes: string[] = [];
  for (const sid of studentIds) {
    const l = last.get(sid);
    const note = (l?.teacher_notes || "").trim();
    if (note) recent_notes.push(note.slice(0, 200));
    if (recent_notes.length >= 6) break;
  }

  // Cohort progress rollup from child_skill_progress.
  const progByDomain = new Map<string, { obs: number; sec: number; dev: number; em: number; scores: number[] }>();
  for (const r of (rollup ?? []) as any[]) {
    const key = r.domain_name || r.domain_code || "General";
    const cur = progByDomain.get(key) ?? { obs: 0, sec: 0, dev: 0, em: 0, scores: [] };
    cur.obs += r.observed_skill_count ?? 0;
    cur.sec += r.secure_count ?? 0;
    cur.dev += r.developing_count ?? 0;
    cur.em  += r.emerging_count ?? 0;
    if (typeof r.average_status_score === "number") cur.scores.push(r.average_status_score);
    progByDomain.set(key, cur);
  }
  const progress_rollup = Array.from(progByDomain.entries()).map(([domain, v]) => ({
    domain,
    observed_skills: v.obs,
    secure: v.sec,
    developing: v.dev,
    emerging: v.em,
    avg_status_score: avg(v.scores),
  }));

  return {
    student_count: studentIds.length,
    assessed_count: first.size,
    domain_trends,
    strongest_domains,
    growing_domains,
    needs_support_domains,
    recent_notes,
    progress_rollup,
  };
}

/**
 * Render the context as a compact, prompt-ready string block.
 * Returns an empty string if there's nothing meaningful to add.
 */
export function renderAssessmentContextBlock(ctx: AssessmentContext): string {
  if (!ctx.student_count || (ctx.assessed_count === 0 && ctx.progress_rollup.length === 0)) {
    return "";
  }
  const lines: string[] = [];
  lines.push(`Cohort: ${ctx.student_count} children, ${ctx.assessed_count} with at least one assessment.`);
  if (ctx.domain_trends.length) {
    lines.push("Assessment trend by domain (baseline → latest, delta):");
    for (const t of ctx.domain_trends) {
      lines.push(`- ${t.domain}: ${t.baseline_avg ?? "—"} → ${t.latest_avg ?? "—"} (Δ ${t.delta ?? "—"}, ${t.trend})`);
    }
  }
  if (ctx.strongest_domains.length)     lines.push(`Strongest domains: ${ctx.strongest_domains.join(", ")}`);
  if (ctx.growing_domains.length)       lines.push(`Growing domains: ${ctx.growing_domains.join(", ")}`);
  if (ctx.needs_support_domains.length) lines.push(`Needs support: ${ctx.needs_support_domains.join(", ")}`);
  if (ctx.progress_rollup.length) {
    lines.push("Progress engine rollup (child_skill_progress per domain):");
    for (const p of ctx.progress_rollup) {
      lines.push(`- ${p.domain}: ${p.observed_skills} skills observed (secure ${p.secure}, developing ${p.developing}, emerging ${p.emerging}; avg ${p.avg_status_score ?? "—"}/3)`);
    }
  }
  if (ctx.recent_notes.length) {
    lines.push("Recent teacher notes from latest assessments:");
    for (const n of ctx.recent_notes) lines.push(`- "${n}"`);
  }
  return `\n\nASSESSMENT & PROGRESS CONTEXT (use as a support signal, not a rigid score):\n${lines.join("\n")}\n\nPlanning rules:\n- Prioritise domains marked "regression" or in "Needs support".\n- Reinforce — don't over-drill — domains already "strongest".\n- Treat low evidence counts as gaps in observation, not in the child.\n- Suggest play-based, age-appropriate activities aligned to the school methodology.`;
}