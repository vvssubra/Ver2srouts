
DROP POLICY IF EXISTS "Branch members can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Branch members can update attendance" ON public.attendance;

CREATE POLICY "Branch members can insert attendance"
ON public.attendance FOR INSERT TO authenticated
WITH CHECK (
  is_member_of_branch(auth.uid(), branch_id)
  AND (
    auth.uid() = marked_by
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'franchisee')
  )
);

CREATE POLICY "Branch members can update attendance"
ON public.attendance FOR UPDATE TO authenticated
USING (
  is_member_of_branch(auth.uid(), branch_id)
  AND (
    auth.uid() = marked_by
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'super_admin')
    OR has_role(auth.uid(), 'franchisee')
  )
)
WITH CHECK (
  is_member_of_branch(auth.uid(), branch_id)
);
