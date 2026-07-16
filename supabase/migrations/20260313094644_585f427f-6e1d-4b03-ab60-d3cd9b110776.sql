CREATE POLICY "Branch admins can read branch user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM branch_memberships bm1
    JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid()
      AND bm2.user_id = user_roles.user_id
      AND (has_role(auth.uid(), 'franchisee'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);