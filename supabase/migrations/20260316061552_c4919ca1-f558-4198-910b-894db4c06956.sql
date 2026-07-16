
CREATE TABLE public.hr_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  policy_type TEXT NOT NULL,
  policy_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, policy_type)
);

ALTER TABLE public.hr_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read hr_policies" ON public.hr_policies
  FOR SELECT TO authenticated USING (
    public.is_member_of_branch(auth.uid(), branch_id)
  );

CREATE POLICY "Admins can insert hr_policies" ON public.hr_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.is_branch_manager(auth.uid(), branch_id)
  );

CREATE POLICY "Admins can update hr_policies" ON public.hr_policies
  FOR UPDATE TO authenticated USING (
    public.is_branch_manager(auth.uid(), branch_id)
  ) WITH CHECK (
    public.is_branch_manager(auth.uid(), branch_id)
  );

CREATE POLICY "Admins can delete hr_policies" ON public.hr_policies
  FOR DELETE TO authenticated USING (
    public.is_branch_manager(auth.uid(), branch_id)
  );
