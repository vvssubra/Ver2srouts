DROP POLICY IF EXISTS "Parents view child branch settings" ON public.branch_settings;
CREATE POLICY "Parents view child branch settings"
ON public.branch_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    WHERE ps.parent_id = auth.uid()
      AND s.branch_id = branch_settings.branch_id
  )
);

DROP POLICY IF EXISTS "Parents view child branch" ON public.branches;
CREATE POLICY "Parents view child branch"
ON public.branches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    WHERE ps.parent_id = auth.uid()
      AND s.branch_id = branches.id
  )
);

DROP POLICY IF EXISTS "Parents view child organization" ON public.organizations;
CREATE POLICY "Parents view child organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.branches b
    JOIN public.students s ON s.branch_id = b.id
    JOIN public.parent_students ps ON ps.student_id = s.id
    WHERE ps.parent_id = auth.uid()
      AND b.organization_id = organizations.id
  )
);