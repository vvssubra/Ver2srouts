
CREATE TABLE IF NOT EXISTS public.branch_methodologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  methodology_framework_id uuid REFERENCES public.methodology_frameworks(id) ON DELETE CASCADE NOT NULL,
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, methodology_framework_id)
);

ALTER TABLE public.branch_methodologies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view methodologies"
  ON public.branch_methodologies FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch managers can manage methodologies"
  ON public.branch_methodologies FOR ALL TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));
