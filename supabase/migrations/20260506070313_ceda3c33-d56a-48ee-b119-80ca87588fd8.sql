DROP POLICY IF EXISTS "Branch managers manage custom leave types" ON public.custom_leave_types;
CREATE POLICY "Branch managers manage custom leave types"
  ON public.custom_leave_types FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_branch_manager(auth.uid(), branch_id));

DROP POLICY IF EXISTS "Staff view active custom leave types in their branch" ON public.custom_leave_types;
CREATE POLICY "Staff view active custom leave types in their branch"
  ON public.custom_leave_types FOR SELECT
  TO authenticated
  USING (is_active = true AND (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_member_of_branch(auth.uid(), branch_id)));

DROP POLICY IF EXISTS "Branch managers manage custom leave balances" ON public.custom_leave_balances;
CREATE POLICY "Branch managers manage custom leave balances"
  ON public.custom_leave_balances FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.is_branch_manager(auth.uid(), branch_id));