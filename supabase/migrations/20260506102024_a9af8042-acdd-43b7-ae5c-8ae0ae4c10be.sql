CREATE POLICY "Admins manage branch designations"
  ON public.staff_designations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND is_member_of_branch(auth.uid(), branch_id));