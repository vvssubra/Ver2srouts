export type LearningArea = {
  id: string;
  code: string;
  name_ms: string;
  name_en: string | null;
};

export type CurriculumStandard = {
  id: string;
  code: string;
  title_ms: string;
  level: string;
  learning_area_id: string;
};

export type Activity = {
  name: string;
  name_ms: string;
  duration_minutes: number;
  learning_area: string;
  standards_addressed: string[];
  description: string;
  materials: string[];
  teacher_notes: string;
  expected_outcomes: string;
  differentiation_strategies?: {
    support_needed: string;
    advanced_challenge: string;
  };
  provocation_questions?: string[];
  observation_cues?: string;
  learning_objective?: string;
  procedure?: {
    introduction: string;
    activity: string;
    conclusion: string;
  };
  book_page?: string;
  teacher_reflection?: string;
  gap_interventions?: GapIntervention[];
};

export type DayPlan = {
  day: number;
  date?: string;
  theme_focus: string;
  activities: Activity[];
  completed?: boolean;
};

export type AssessmentItem = {
  standard_code: string;
  indicator: string;
  rating_scale: string[];
};

export type GeneratedPlan = {
  title: string;
  overview: string;
  days: DayPlan[];
  assessment_checklist: AssessmentItem[];
  parent_connection_snippet?: string;
};

export type Worksheet = {
  id: string;
  title: string;
  subject: string;
  pdf_url: string;
  metadata_tags: string[];
  relevance?: number;
};

export type ViewMode = "create" | "library" | "view";
export type PlanType = "theme" | "subject" | "enrichment" | "manual";

export type GapIntervention = {
  student_name: string;
  gap: string;
  suggested_activity: string;
};

export type PlanContext = {
  title: string;
  theme: string;
  ageGroup: string;
  duration: string;
  planSummary: string;
  standard_codes: string[];
};
