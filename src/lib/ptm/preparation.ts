import type { AssessmentSummary } from "./assessment-comparison";
import type { JourneyTimelineItem } from "./learning-journey";
import type { HighlightItem } from "./highlights";

export type PreparationRow = {
  id: string;
  student_id: string;
  branch_id: string;
  academic_year_id: string | null;
  term_label: string;
  strengths: string | null;
  areas_for_development: string | null;
  next_learning_goals: string | null;
  home_activities: string | null;
  discussion_notes: string | null;
  action_plan: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  updated_at: string;
};

export type PreparationDraft = {
  strengths: string;
  areas_for_development: string;
  next_learning_goals: string;
  home_activities: string;
  discussion_notes: string;
  action_plan: string;
};

export const EMPTY_PREPARATION: PreparationDraft = {
  strengths: "",
  areas_for_development: "",
  next_learning_goals: "",
  home_activities: "",
  discussion_notes: "",
  action_plan: "",
};

export type ReadinessItem = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint?: string;
};

export function buildReadinessChecklist(input: {
  studentPresent: boolean;
  assessment: AssessmentSummary | null;
  journey: { total: number; included: number };
  highlights: { total: number; included: number };
  prep: PreparationDraft;
}): ReadinessItem[] {
  const { studentPresent, assessment, journey, highlights, prep } = input;
  const hasText = (v: string) => v.trim().length > 0;
  const teacherSummaryOk =
    hasText(prep.strengths) &&
    hasText(prep.areas_for_development) &&
    hasText(prep.next_learning_goals) &&
    hasText(prep.home_activities);

  return [
    { key: "student", label: "Student profile", required: true, ok: studentPresent },
    {
      key: "assessment",
      label: "Assessment comparison (baseline & current)",
      required: true,
      ok: !!(assessment && assessment.baseline && assessment.current && assessment.baseline.id !== assessment.current.id),
      hint: "Record two assessments in the selected term.",
    },
    {
      key: "journey",
      label: "Learning Journey entries reviewed",
      required: true,
      ok: journey.total === 0 || journey.included > 0,
      hint: journey.total === 0 ? "No Learning Journey entries in this term." : "Include at least one entry.",
    },
    {
      key: "milestones",
      label: "Milestones & learning photos reviewed",
      required: false,
      ok: highlights.total === 0 || highlights.included > 0,
      hint: highlights.total === 0 ? "No shared milestones/photos in this term." : undefined,
    },
    {
      key: "teacher_summary",
      label: "Teacher summary (strengths, growth, goals, home activities)",
      required: true,
      ok: teacherSummaryOk,
    },
    {
      key: "action_plan",
      label: "PTM discussion notes & action plan",
      required: true,
      ok: hasText(prep.discussion_notes) && hasText(prep.action_plan),
    },
  ];
}

export function checklistBlockingIssues(items: ReadinessItem[]): ReadinessItem[] {
  return items.filter((i) => i.required && !i.ok);
}

// Convenience narrower used by the UI to summarise sections.
export function summariseCounts(journey: JourneyTimelineItem[], highlights: HighlightItem[], includedJourney: Set<string>, includedHighlights: Set<string>) {
  return {
    journey: { total: journey.length, included: [...includedJourney].filter((k) => journey.some((j) => j.key === k)).length },
    highlights: { total: highlights.length, included: [...includedHighlights].filter((k) => highlights.some((h) => h.key === k)).length },
  };
}