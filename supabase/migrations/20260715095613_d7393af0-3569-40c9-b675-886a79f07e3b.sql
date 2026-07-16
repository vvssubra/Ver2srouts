
DROP POLICY IF EXISTS "Managers can insert branch events" ON public.branch_events;
DROP POLICY IF EXISTS "Managers can update branch events" ON public.branch_events;
DROP POLICY IF EXISTS "Managers can delete branch events" ON public.branch_events;

CREATE POLICY "Managers can insert branch events" ON public.branch_events
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('franchisee', 'admin'))
      AND public.is_member_of_branch(auth.uid(), branch_id)
    )
  );

CREATE POLICY "Managers can update branch events" ON public.branch_events
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('franchisee', 'admin'))
      AND public.is_member_of_branch(auth.uid(), branch_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('franchisee', 'admin'))
      AND public.is_member_of_branch(auth.uid(), branch_id)
    )
  );

CREATE POLICY "Managers can delete branch events" ON public.branch_events
  FOR DELETE TO authenticated USING (
    public.is_super_admin(auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('franchisee', 'admin'))
      AND public.is_member_of_branch(auth.uid(), branch_id)
    )
  );
