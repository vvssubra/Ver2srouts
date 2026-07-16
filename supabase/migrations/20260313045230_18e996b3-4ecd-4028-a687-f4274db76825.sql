
CREATE POLICY "Admins can view branch leave requests"
ON public.leave_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Admins can update branch leave requests"
ON public.leave_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.is_member_of_branch(auth.uid(), branch_id));
