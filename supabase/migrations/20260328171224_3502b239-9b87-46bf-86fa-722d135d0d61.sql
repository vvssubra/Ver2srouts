
-- Phase 2: Extend lesson_plans for curriculum-driven planning
ALTER TABLE public.lesson_plans
  ADD COLUMN IF NOT EXISTS monthly_plan_id uuid REFERENCES public.monthly_curriculum_plans(id),
  ADD COLUMN IF NOT EXISTS weekly_plan_id uuid REFERENCES public.weekly_curriculum_plans(id),
  ADD COLUMN IF NOT EXISTS theme_bank_id uuid REFERENCES public.theme_bank(id),
  ADD COLUMN IF NOT EXISTS objective_ids_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS domain_tags_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS routine_blocks_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS center_plan_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provocations_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observation_targets_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parent_story_prompt text,
  ADD COLUMN IF NOT EXISTS ptm_evidence_tags_json jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_extension_json jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Create learning_center_plans table
CREATE TABLE IF NOT EXISTS public.learning_center_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid REFERENCES public.weekly_curriculum_plans(id),
  lesson_plan_id uuid REFERENCES public.lesson_plans(id),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  week_starting date,
  center_type text NOT NULL,
  center_label text NOT NULL,
  setup_description text,
  materials_json jsonb DEFAULT '[]'::jsonb,
  learning_objectives_json jsonb DEFAULT '[]'::jsonb,
  linked_domains_json jsonb DEFAULT '[]'::jsonb,
  observation_prompts_json jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_center_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view learning center plans"
  ON public.learning_center_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert learning center plans"
  ON public.learning_center_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update learning center plans"
  ON public.learning_center_plans FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete learning center plans"
  ON public.learning_center_plans FOR DELETE TO authenticated
  USING (auth.uid() = created_by);
