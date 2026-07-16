
-- ============================================================
-- PHASE 1: Bloomngrow Academic Engine — Backend Foundation
-- ============================================================
-- Purpose: Create the core linking schema for a connected
-- preschool curriculum engine (Year → Month → Week → Lesson →
-- Objective → Indicator → Student Mastery) without breaking
-- any existing tables or flows.
-- ============================================================

-- 1. age_groups — canonical age groupings for the preschool
-- Replaces ad-hoc string-based age_group columns with a proper reference table
CREATE TABLE IF NOT EXISTS public.age_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,         -- e.g. AGE3, AGE4, AGE5, AGE6
  label text NOT NULL,               -- e.g. "3 Years"
  min_age_months integer NOT NULL,   -- 36 for 3-year-olds
  max_age_months integer NOT NULL,   -- 47 for 3-year-olds
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the four standard preschool age groups
INSERT INTO public.age_groups (code, label, min_age_months, max_age_months, sort_order)
VALUES
  ('AGE3', '3 Years', 36, 47, 1),
  ('AGE4', '4 Years', 48, 59, 2),
  ('AGE5', '5 Years', 60, 71, 3),
  ('AGE6', '6 Years', 72, 83, 4)
ON CONFLICT (code) DO NOTHING;

-- 2. yearly_outcomes — what children should achieve by end of year per age/domain
-- Links the development_domains framework to age-specific yearly expectations
CREATE TABLE IF NOT EXISTS public.yearly_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id uuid NOT NULL REFERENCES public.age_groups(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.development_domains(id) ON DELETE CASCADE,
  outcome_code text NOT NULL,        -- e.g. "YO-COG-3-01"
  outcome_title text NOT NULL,
  outcome_description text,
  mastery_expectation text,          -- what "mastered" looks like
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(age_group_id, outcome_code)
);

-- 3. curriculum_year_plans — annual curriculum plan per branch/age/academic year
-- Connects a branch's academic year to age-specific yearly outcome targets
CREATE TABLE IF NOT EXISTS public.curriculum_year_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  age_group_id uuid NOT NULL REFERENCES public.age_groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',  -- draft, active, archived
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, academic_year_id, age_group_id)
);

-- 4. curriculum_month_plans — monthly breakdown of the year plan
-- Each month targets specific outcomes and themes
CREATE TABLE IF NOT EXISTS public.curriculum_month_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year_plan_id uuid NOT NULL REFERENCES public.curriculum_year_plans(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_number integer NOT NULL,     -- 1-12
  theme text,                        -- optional thematic focus
  theme_bank_id uuid REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  focus_outcomes jsonb DEFAULT '[]',  -- array of yearly_outcome_ids targeted this month
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year_plan_id, month_number)
);

-- 5. curriculum_week_plans — weekly breakdown of the month plan
-- Each week targets specific objectives and activities
CREATE TABLE IF NOT EXISTS public.curriculum_week_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_plan_id uuid NOT NULL REFERENCES public.curriculum_month_plans(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  week_number integer NOT NULL,       -- week within the month (1-5)
  week_starting date,                 -- actual calendar date
  focus_area text,                    -- what this week emphasizes
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(month_plan_id, week_number)
);

-- 6. lesson_objectives — what a child should learn, linked to age/domain/yearly outcome
-- These are the measurable learning targets teachers plan against
CREATE TABLE IF NOT EXISTS public.lesson_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id uuid NOT NULL REFERENCES public.age_groups(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.development_domains(id) ON DELETE CASCADE,
  yearly_outcome_id uuid REFERENCES public.yearly_outcomes(id) ON DELETE SET NULL,
  code text NOT NULL UNIQUE,          -- e.g. "OBJ-COG-3-01"
  title text NOT NULL,
  description text,
  bloom_level text,                   -- remember, understand, apply, analyze, etc.
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. weekly_focus_objectives — which objectives are targeted in a specific week plan
-- Junction table linking week plans to the objectives teachers should cover
CREATE TABLE IF NOT EXISTS public.weekly_focus_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_plan_id uuid NOT NULL REFERENCES public.curriculum_week_plans(id) ON DELETE CASCADE,
  lesson_objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  priority text DEFAULT 'primary',    -- primary, secondary, review
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(week_plan_id, lesson_objective_id)
);

-- 8. objective_indicators — observable signs that a child is meeting an objective
-- These are what teachers look for during observations
CREATE TABLE IF NOT EXISTS public.objective_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  indicator_text text NOT NULL,
  evidence_type text DEFAULT 'observation',  -- observation, work_sample, teacher_checklist
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. lesson_plan_objectives — which objectives a specific lesson plan targets
-- Links the lesson_plans table to the objectives framework
CREATE TABLE IF NOT EXISTS public.lesson_plan_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  lesson_objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_plan_id, lesson_objective_id)
);

-- 10. lesson_plan_objective_indicators — which indicators a lesson plan expects to observe
-- Allows teachers to pre-select what they'll watch for during a lesson
CREATE TABLE IF NOT EXISTS public.lesson_plan_objective_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  objective_indicator_id uuid NOT NULL REFERENCES public.objective_indicators(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_plan_id, objective_indicator_id)
);

-- 11. student_mastery_status — tracks each student's mastery level per objective
-- The core child progress tracker
CREATE TABLE IF NOT EXISTS public.student_mastery_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  mastery_level text NOT NULL DEFAULT 'not_started',  -- not_started, emerging, developing, proficient, mastered
  evidence_count integer NOT NULL DEFAULT 0,
  last_assessed_at timestamptz,
  assessed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, lesson_objective_id)
);

-- 12. student_indicator_status — tracks each student's status per indicator
-- More granular than mastery — shows which specific behaviors have been observed
CREATE TABLE IF NOT EXISTS public.student_indicator_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  objective_indicator_id uuid NOT NULL REFERENCES public.objective_indicators(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_observed',  -- not_observed, observed_once, observed_consistently, confirmed
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  observation_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, objective_indicator_id)
);

-- 13. student_intervention_plans — structured support for children needing extra help
-- Tracks when and why a child needs intervention, and what actions are taken
CREATE TABLE IF NOT EXISTS public.student_intervention_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  lesson_objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  concern_description text NOT NULL,
  intervention_strategy text,
  target_date date,
  status text NOT NULL DEFAULT 'active',  -- active, monitoring, resolved, escalated
  created_by uuid NOT NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 14. student_lesson_exposure — records which lessons each student has been exposed to
-- Provides the data layer for "has this child experienced this objective in a lesson?"
CREATE TABLE IF NOT EXISTS public.student_lesson_exposure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  lesson_plan_id uuid NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  lesson_objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE SET NULL,
  exposure_date date NOT NULL,
  attendance_status text DEFAULT 'present',  -- present, absent, partial
  engagement_level text,                      -- high, medium, low
  teacher_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, lesson_plan_id, lesson_objective_id)
);

-- 15. readiness_profiles — school readiness assessment template per age group
-- Defines what "ready for next level" means
CREATE TABLE IF NOT EXISTS public.readiness_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group_id uuid NOT NULL REFERENCES public.age_groups(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 16. readiness_profile_objectives — which objectives must be mastered for readiness
-- Links readiness profiles to the objectives a child needs to demonstrate
CREATE TABLE IF NOT EXISTS public.readiness_profile_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  readiness_profile_id uuid NOT NULL REFERENCES public.readiness_profiles(id) ON DELETE CASCADE,
  lesson_objective_id uuid NOT NULL REFERENCES public.lesson_objectives(id) ON DELETE CASCADE,
  minimum_mastery_level text NOT NULL DEFAULT 'proficient',  -- the level required
  weight integer NOT NULL DEFAULT 1,  -- importance weighting
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(readiness_profile_id, lesson_objective_id)
);

-- ============================================================
-- ALTER EXISTING TABLES — additive columns only
-- ============================================================

-- lesson_plans: link to new curriculum hierarchy and age group
ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS year_plan_id uuid REFERENCES public.curriculum_year_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS month_plan_id uuid REFERENCES public.curriculum_month_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS week_plan_id uuid REFERENCES public.curriculum_week_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS age_group_id uuid REFERENCES public.age_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'draft';

-- students: link to age group and add intervention/readiness flags
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS age_group_id uuid REFERENCES public.age_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS readiness_status text DEFAULT 'not_assessed',
  ADD COLUMN IF NOT EXISTS current_intervention_flag boolean DEFAULT false;

-- student_observation_evidence: link observations to objectives/indicators/week plans
ALTER TABLE public.student_observation_evidence
  ADD COLUMN IF NOT EXISTS lesson_objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS objective_indicator_id uuid REFERENCES public.objective_indicators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS week_plan_id uuid REFERENCES public.curriculum_week_plans(id) ON DELETE SET NULL;

-- daily_learning_journey_entries: link journey entries to objectives/indicators
ALTER TABLE public.daily_learning_journey_entries
  ADD COLUMN IF NOT EXISTS lesson_objective_id uuid REFERENCES public.lesson_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS objective_indicator_id uuid REFERENCES public.objective_indicators(id) ON DELETE SET NULL;

-- ============================================================
-- INDEXES — for performant querying of the new relationships
-- ============================================================

-- Yearly outcomes by age and domain
CREATE INDEX IF NOT EXISTS idx_yearly_outcomes_age_domain ON public.yearly_outcomes(age_group_id, domain_id);

-- Month plan by year plan
CREATE INDEX IF NOT EXISTS idx_month_plans_year ON public.curriculum_month_plans(year_plan_id);

-- Week plan by month plan
CREATE INDEX IF NOT EXISTS idx_week_plans_month ON public.curriculum_week_plans(month_plan_id);

-- Lesson objectives by age and domain
CREATE INDEX IF NOT EXISTS idx_lesson_objectives_age_domain ON public.lesson_objectives(age_group_id, domain_id);

-- Student mastery by student
CREATE INDEX IF NOT EXISTS idx_student_mastery_student ON public.student_mastery_status(student_id);
CREATE INDEX IF NOT EXISTS idx_student_mastery_objective ON public.student_mastery_status(lesson_objective_id);

-- Student indicator status
CREATE INDEX IF NOT EXISTS idx_student_indicator_student ON public.student_indicator_status(student_id);

-- Interventions by student and status
CREATE INDEX IF NOT EXISTS idx_interventions_student_status ON public.student_intervention_plans(student_id, status);

-- Student lesson exposure
CREATE INDEX IF NOT EXISTS idx_lesson_exposure_student ON public.student_lesson_exposure(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_exposure_plan ON public.student_lesson_exposure(lesson_plan_id);

-- Observation evidence by student and objective
CREATE INDEX IF NOT EXISTS idx_obs_evidence_student_objective ON public.student_observation_evidence(student_id, lesson_objective_id);

-- Journey entries by student and objective
CREATE INDEX IF NOT EXISTS idx_journey_student_objective ON public.daily_learning_journey_entries(student_id, lesson_objective_id);

-- Lesson plan links
CREATE INDEX IF NOT EXISTS idx_lesson_plans_year_plan ON public.lesson_plans(year_plan_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_month_plan ON public.lesson_plans(month_plan_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_week_plan ON public.lesson_plans(week_plan_id);
CREATE INDEX IF NOT EXISTS idx_lesson_plans_age_group ON public.lesson_plans(age_group_id);

-- Students age group
CREATE INDEX IF NOT EXISTS idx_students_age_group ON public.students(age_group_id);

-- ============================================================
-- RLS POLICIES — branch-scoped access for new tables
-- ============================================================

ALTER TABLE public.age_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "age_groups_read_all" ON public.age_groups FOR SELECT TO authenticated USING (true);

ALTER TABLE public.yearly_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "yearly_outcomes_read_all" ON public.yearly_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "yearly_outcomes_manage_admin" ON public.yearly_outcomes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.curriculum_year_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "year_plans_branch_read" ON public.curriculum_year_plans FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "year_plans_branch_manage" ON public.curriculum_year_plans FOR ALL TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.curriculum_month_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "month_plans_branch_read" ON public.curriculum_month_plans FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "month_plans_branch_manage" ON public.curriculum_month_plans FOR ALL TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.curriculum_week_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "week_plans_branch_read" ON public.curriculum_week_plans FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "week_plans_branch_manage" ON public.curriculum_week_plans FOR ALL TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.lesson_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lesson_objectives_read_all" ON public.lesson_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "lesson_objectives_manage_admin" ON public.lesson_objectives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.weekly_focus_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weekly_focus_read" ON public.weekly_focus_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "weekly_focus_manage" ON public.weekly_focus_objectives FOR ALL TO authenticated USING (true);

ALTER TABLE public.objective_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicators_read_all" ON public.objective_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "indicators_manage_admin" ON public.objective_indicators FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.lesson_plan_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lp_objectives_read" ON public.lesson_plan_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "lp_objectives_manage" ON public.lesson_plan_objectives FOR ALL TO authenticated USING (true);

ALTER TABLE public.lesson_plan_objective_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lp_indicators_read" ON public.lesson_plan_objective_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "lp_indicators_manage" ON public.lesson_plan_objective_indicators FOR ALL TO authenticated USING (true);

ALTER TABLE public.student_mastery_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mastery_branch_read" ON public.student_mastery_status FOR SELECT TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "mastery_branch_manage" ON public.student_mastery_status FOR ALL TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.student_indicator_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "indicator_status_read" ON public.student_indicator_status FOR SELECT TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "indicator_status_manage" ON public.student_indicator_status FOR ALL TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.student_intervention_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interventions_branch_read" ON public.student_intervention_plans FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "interventions_branch_manage" ON public.student_intervention_plans FOR ALL TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.student_lesson_exposure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exposure_read" ON public.student_lesson_exposure FOR SELECT TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));
CREATE POLICY "exposure_manage" ON public.student_lesson_exposure FOR ALL TO authenticated
  USING (public.is_student_in_user_branch(auth.uid(), student_id) OR public.is_super_admin(auth.uid()));

ALTER TABLE public.readiness_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "readiness_profiles_read" ON public.readiness_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "readiness_profiles_manage" ON public.readiness_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.readiness_profile_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "readiness_obj_read" ON public.readiness_profile_objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "readiness_obj_manage" ON public.readiness_profile_objectives FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));
