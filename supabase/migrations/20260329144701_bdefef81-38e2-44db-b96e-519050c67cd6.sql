CREATE POLICY "Super admins can manage methodologies"
  ON public.branch_methodologies
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));