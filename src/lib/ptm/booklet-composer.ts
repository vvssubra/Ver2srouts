import type { AssessmentSummary } from "./assessment-comparison";
import type { JourneyTimelineItem } from "./learning-journey";
import type { HighlightItem } from "./highlights";
import type { PreparationDraft } from "./preparation";

/**
 * Phase 5 — Booklet Composer.
 *
 * Assembles the final PTM Booklet payload from teacher-approved Phase 1-4
 * data. This is a pure, deterministic function — no AI, no fabrication. The
 * output shape matches what `PtmBookletPrintView` renders and what we store
 * in `ptm_reports.generated_content`, so historical snapshots stay readable
 * with the same viewer.
 */

export type ComposeInput = {
  studentName: string;
  academicYearName: string | null;
  termLabel: string;
  termStart: string;
  termEnd: string;
  assessment: AssessmentSummary | null;
  journey: JourneyTimelineItem[];
  journeyIncluded: Set<string>;
  journeyOrder: string[];
  highlights: HighlightItem[];
  highlightIncluded: Set<string>;
  highlightOrder: string[];
  prep: PreparationDraft;
};

const splitLines = (v: string) =>
  (v || "")
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Convert a multi-line teacher text block into structured "area" cards. */
function toAreaCards(text: string, suggestion?: string) {
  const lines = splitLines(text);
  if (lines.length === 0) return [];
  return lines.map((line, i) => {
    // Support "Title: description" one-liners.
    const m = line.match(/^([^:]{2,60}):\s*(.+)$/);
    const area = m ? m[1].trim() : `Focus ${i + 1}`;
    const description = m ? m[2].trim() : line;
    return {
      area,
      description,
      suggestion: i === 0 && suggestion ? suggestion : undefined,
    };
  });
}

function toActivityCards(text: string) {
  const lines = splitLines(text);
  return lines.map((line, i) => {
    const m = line.match(/^([^:]{2,60}):\s*(.+)$/);
    return {
      title: m ? m[1].trim() : `Home activity ${i + 1}`,
      description: m ? m[2].trim() : line,
      materials: undefined as string | undefined,
      learningArea: undefined as string | undefined,
    };
  });
}

function toActionRows(text: string) {
  const lines = splitLines(text);
  return lines.map((line) => {
    // "action | owner | timeline" or "action — owner — timeline"
    const parts = line.split(/\s*[|·—]\s*/);
    return {
      action: parts[0]?.trim() || line,
      owner: parts[1]?.trim() || "Teacher & Parent",
      timeline: parts[2]?.trim() || "Next term",
    };
  });
}

export type BookletContent = {
  termName: string;
  overallNarrative: string;
  strengthsCelebrations: string[];
  areasForSupport: Array<{ area: string; description: string; suggestion?: string }>;
  atHomeActivities: Array<{ title: string; description: string; materials?: string; learningArea?: string }>;
  actionPlan: Array<{ action: string; owner: string; timeline: string }>;
  highlightMoments: Array<{
    key: string;
    update_id: string;
    date: string;
    caption: string;
    domain: string;
    milestone: boolean;
    photo_url: string | null;
  }>;
  learningJourney: {
    termLabel: string;
    academicYear: string | null;
    totalAvailable: number;
    items: Array<any>;
  };
  assessmentSummary: AssessmentSummary | null;
  // Provenance so history rows can be inspected later.
  meta: {
    composedAt: string;
    schemaVersion: 1;
    source: "phase5-composer";
    termStart: string;
    termEnd: string;
  };
};

export function composeBooklet(input: ComposeInput): BookletContent {
  const journeyByKey = new Map(input.journey.map((i) => [i.key, i]));
  const highlightByKey = new Map(input.highlights.map((i) => [i.key, i]));

  const journeyItems = input.journeyOrder
    .filter((k) => input.journeyIncluded.has(k))
    .map((k) => journeyByKey.get(k))
    .filter(Boolean)
    .map((i: any) => ({
      key: i.key,
      source: i.source,
      id: i.id,
      date: i.date,
      title: i.title,
      domain: i.domain,
      tpLevel: i.tpLevel,
      teacherNote: i.teacherNote,
      entryType: i.entryType,
    }));

  const highlightItems = input.highlightOrder
    .filter((k) => input.highlightIncluded.has(k))
    .map((k) => highlightByKey.get(k))
    .filter(Boolean)
    .map((i: any) => ({
      key: i.key,
      update_id: i.update_id,
      date: i.date,
      caption: i.caption,
      domain: i.domain,
      milestone: i.milestone,
      photo_url: i.photo_url,
    }));

  return {
    termName: `${input.academicYearName ?? ""}${input.academicYearName ? " · " : ""}${input.termLabel}`.trim() || input.termLabel,
    overallNarrative: input.prep.discussion_notes || "",
    strengthsCelebrations: splitLines(input.prep.strengths),
    areasForSupport: toAreaCards(input.prep.areas_for_development, input.prep.next_learning_goals),
    atHomeActivities: toActivityCards(input.prep.home_activities),
    actionPlan: toActionRows(input.prep.action_plan),
    highlightMoments: highlightItems,
    learningJourney: {
      termLabel: input.termLabel,
      academicYear: input.academicYearName,
      totalAvailable: input.journey.length,
      items: journeyItems,
    },
    assessmentSummary: input.assessment,
    meta: {
      composedAt: new Date().toISOString(),
      schemaVersion: 1,
      source: "phase5-composer",
      termStart: input.termStart,
      termEnd: input.termEnd,
    },
  };
}

/** Publishing validation — mirrors readiness checklist for clarity. */
export function validateForPublish(input: {
  yearId: string | null;
  termLabel: string | null;
  assessment: AssessmentSummary | null;
  prep: PreparationDraft;
  approved: boolean;
}): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.yearId) missing.push("Academic year");
  if (!input.termLabel) missing.push("Term");
  if (!input.assessment || !input.assessment.baseline || !input.assessment.current)
    missing.push("Assessment comparison (baseline & current)");
  if (!input.prep.strengths.trim()) missing.push("Teacher summary: strengths");
  if (!input.prep.areas_for_development.trim()) missing.push("Teacher summary: areas for development");
  if (!input.prep.next_learning_goals.trim()) missing.push("Teacher summary: next learning goals");
  if (!input.prep.home_activities.trim()) missing.push("Home activities");
  if (!input.prep.discussion_notes.trim()) missing.push("PTM discussion notes");
  if (!input.prep.action_plan.trim()) missing.push("Action plan");
  if (!input.approved) missing.push("Teacher approval of booklet content");
  return { ok: missing.length === 0, missing };
}