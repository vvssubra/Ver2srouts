-- Allow HR (admin) and franchisees to insert staff documents for staff in their branch, and super admins anywhere.
CREATE POLICY "Admins insert branch staff documents"
ON public.staff_documents
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'franchisee'::app_role))
    AND EXISTS (
      SELECT 1
      FROM branch_memberships bm1
      JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
      WHERE bm1.user_id = auth.uid()
        AND bm2.user_id = staff_documents.user_id
    )
  )
);