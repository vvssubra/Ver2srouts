
CREATE TABLE public.ptm_preparation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  academic_year_id uuid,
  term_label text NOT NULL,
  strengths text,
  areas_for_development text,
  next_learning_goals text,
  home_activities text,
  discussion_notes text,
  action_plan text,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  approved_by uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id, term_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ptm_preparation TO authenticated;
GRANT ALL ON public.ptm_preparation TO service_role;

ALTER TABLE public.ptm_preparation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view ptm preparation"
  ON public.ptm_preparation FOR SELECT
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch members insert ptm preparation"
  ON public.ptm_preparation FOR INSERT
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch members update ptm preparation"
  ON public.ptm_preparation FOR UPDATE
  USING (public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch members delete ptm preparation"
  ON public.ptm_preparation FOR DELETE
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage ptm preparation"
  ON public.ptm_preparation FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ptm_preparation_updated_at
  BEFORE UPDATE ON public.ptm_preparation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
