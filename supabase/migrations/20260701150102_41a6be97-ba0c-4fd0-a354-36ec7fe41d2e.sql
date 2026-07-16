
CREATE TABLE public.weekly_teaching_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_plan_id uuid NOT NULL REFERENCES public.curriculum_week_plans(id) ON DELETE CASCADE,
  subject text NOT NULL CHECK (subject IN (
    'english','bahasa_melayu','maths','science','tamil','mandarin',
    'islamic_studies','moral','practical_life','creative'
  )),
  what_teaching text,
  learning_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_words jsonb NOT NULL DEFAULT '[]'::jsonb,
  resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_plan_id, subject)
);

CREATE INDEX idx_weekly_teaching_subjects_week_plan ON public.weekly_teaching_subjects(week_plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_teaching_subjects TO authenticated;
GRANT ALL ON public.weekly_teaching_subjects TO service_role;

ALTER TABLE public.weekly_teaching_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wts_read_via_week_plan" ON public.weekly_teaching_subjects
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_subjects.week_plan_id
      AND (is_super_admin(auth.uid()) OR is_member_of_branch(auth.uid(), w.branch_id))
  )
);

CREATE POLICY "wts_manage_via_week_plan" ON public.weekly_teaching_subjects
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_subjects.week_plan_id
      AND (is_super_admin(auth.uid()) OR is_member_of_branch(auth.uid(), w.branch_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_subjects.week_plan_id
      AND (is_super_admin(auth.uid()) OR is_member_of_branch(auth.uid(), w.branch_id))
  )
);

CREATE TRIGGER trg_wts_updated_at
BEFORE UPDATE ON public.weekly_teaching_subjects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
