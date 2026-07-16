DROP POLICY IF EXISTS "Franchisees manage student fees" ON public.student_fees;
CREATE POLICY "Franchisees manage student fees"
ON public.student_fees
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_fees.student_id
      AND has_role(auth.uid(), 'franchisee'::app_role)
      AND is_member_of_branch(auth.uid(), s.branch_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_fees.student_id
      AND has_role(auth.uid(), 'franchisee'::app_role)
      AND is_member_of_branch(auth.uid(), s.branch_id)
  )
);

DROP POLICY IF EXISTS "Super admins manage student fees" ON public.student_fees;
CREATE POLICY "Super admins manage student fees"
ON public.student_fees
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));