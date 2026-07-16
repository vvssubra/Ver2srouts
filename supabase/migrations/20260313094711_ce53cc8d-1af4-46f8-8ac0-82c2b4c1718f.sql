CREATE POLICY "Admins can view branch staff profiles"
ON public.staff_profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND EXISTS (
    SELECT 1
    FROM branch_memberships bm1
    JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid()
      AND bm2.user_id = staff_profiles.user_id
  )
);