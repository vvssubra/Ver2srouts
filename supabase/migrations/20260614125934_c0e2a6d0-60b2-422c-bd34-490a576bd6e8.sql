
-- ─────────────────────────────────────────────────────────────────────────
-- Batch 6F-B: Teacher–Parent Next Focus sync
-- ─────────────────────────────────────────────────────────────────────────

-- Enum for focus source
DO $$ BEGIN
  CREATE TYPE public.next_focus_source AS ENUM (
    'ai_growth_summary', 'weekly_plan', 'assessment', 'teacher_manual', 'principal_manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.next_focus_status AS ENUM (
    'suggested', 'teacher_reviewed', 'approved', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.child_next_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  weekly_plan_id uuid,
  lesson_plan_id uuid,
  source public.next_focus_source NOT NULL DEFAULT 'weekly_plan',
  focus_title text NOT NULL,
  focus_description text,
  domain_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill_labels_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  home_support_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  observation_cues_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.next_focus_status NOT NULL DEFAULT 'suggested',
  visible_to_parent boolean NOT NULL DEFAULT false,
  week_starting date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cnf_student_week
  ON public.child_next_focus(student_id, week_starting);
CREATE INDEX IF NOT EXISTS idx_cnf_branch_week
  ON public.child_next_focus(branch_id, week_starting DESC);
CREATE INDEX IF NOT EXISTS idx_cnf_class_week
  ON public.child_next_focus(class_id, week_starting DESC);
CREATE INDEX IF NOT EXISTS idx_cnf_status
  ON public.child_next_focus(branch_id, status, week_starting DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_next_focus TO authenticated;
GRANT ALL ON public.child_next_focus TO service_role;

ALTER TABLE public.child_next_focus ENABLE ROW LEVEL SECURITY;

-- Parents: only approved-link children, only parent-visible rows
CREATE POLICY "Parents view linked child focus"
ON public.child_next_focus FOR SELECT
TO authenticated
USING (
  visible_to_parent = true
  AND EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = child_next_focus.student_id
      AND ps.parent_id  = auth.uid()
      AND ps.status     = 'approved'
  )
);

-- Branch staff: full read on branch focus
CREATE POLICY "Branch staff view branch focus"
ON public.child_next_focus FOR SELECT
TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id));

-- Branch staff: create/update/delete branch focus
CREATE POLICY "Branch staff insert branch focus"
ON public.child_next_focus FOR INSERT
TO authenticated
WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch staff update branch focus"
ON public.child_next_focus FOR UPDATE
TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id))
WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch staff delete branch focus"
ON public.child_next_focus FOR DELETE
TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id));

-- Super admins
CREATE POLICY "Super admins manage all focus"
ON public.child_next_focus FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_cnf_updated_at
BEFORE UPDATE ON public.child_next_focus
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- Evidence link table
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.child_next_focus_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_id uuid NOT NULL REFERENCES public.child_next_focus(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  child_update_id uuid NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  child_update_skill_id uuid REFERENCES public.child_update_skills(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnfe_focus ON public.child_next_focus_evidence(focus_id);
CREATE INDEX IF NOT EXISTS idx_cnfe_student ON public.child_next_focus_evidence(student_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cnfe_focus_update
  ON public.child_next_focus_evidence(focus_id, child_update_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_next_focus_evidence TO authenticated;
GRANT ALL ON public.child_next_focus_evidence TO service_role;

ALTER TABLE public.child_next_focus_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents view linked child focus evidence"
ON public.child_next_focus_evidence FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.child_next_focus f
    WHERE f.id = child_next_focus_evidence.focus_id
      AND f.visible_to_parent = true
      AND EXISTS (
        SELECT 1 FROM public.parent_students ps
        WHERE ps.student_id = f.student_id
          AND ps.parent_id  = auth.uid()
          AND ps.status     = 'approved'
      )
  )
);

CREATE POLICY "Branch staff manage focus evidence"
ON public.child_next_focus_evidence FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_next_focus_evidence.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_next_focus_evidence.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
);

CREATE POLICY "Super admins manage all focus evidence"
ON public.child_next_focus_evidence FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
