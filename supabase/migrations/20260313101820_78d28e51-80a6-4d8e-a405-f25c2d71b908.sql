
CREATE POLICY "Admins can view branch staff attendance"
  ON public.staff_attendance FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Admins can insert branch staff attendance"
  ON public.staff_attendance FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Admins can update branch staff attendance"
  ON public.staff_attendance FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') AND is_member_of_branch(auth.uid(), branch_id));
