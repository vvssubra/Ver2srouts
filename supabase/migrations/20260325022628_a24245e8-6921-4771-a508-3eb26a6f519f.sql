-- Allow admins to insert leave requests on behalf of branch staff
CREATE POLICY "Admins can insert branch leave requests"
ON public.leave_requests
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND is_member_of_branch(auth.uid(), branch_id)
);

-- Allow franchisees to insert leave requests on behalf of branch staff
CREATE POLICY "Franchisees can insert branch leave requests"
ON public.leave_requests
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'franchisee'::app_role)
  AND is_member_of_branch(auth.uid(), branch_id)
);