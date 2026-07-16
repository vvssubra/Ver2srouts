-- Allow franchisee/admin to manage T&C for their branch; super_admin manages global
DROP POLICY IF EXISTS "Super admins manage T&C" ON public.tnc_versions;

CREATE POLICY "Super admins manage global T&C"
  ON public.tnc_versions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch admins manage branch T&C"
  ON public.tnc_versions
  FOR ALL TO authenticated
  USING (
    branch_id IS NOT NULL
    AND public.is_member_of_branch(auth.uid(), branch_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'franchisee'::app_role)
    )
  )
  WITH CHECK (
    branch_id IS NOT NULL
    AND public.is_member_of_branch(auth.uid(), branch_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'franchisee'::app_role)
    )
  );