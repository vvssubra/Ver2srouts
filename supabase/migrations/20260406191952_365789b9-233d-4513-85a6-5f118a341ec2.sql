-- Fix RLS: allow super_admin to manage hr_policies
DROP POLICY IF EXISTS "Admins can insert hr_policies" ON public.hr_policies;
DROP POLICY IF EXISTS "Admins can update hr_policies" ON public.hr_policies;

CREATE POLICY "Admins can insert hr_policies" ON public.hr_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  );

CREATE POLICY "Admins can update hr_policies" ON public.hr_policies
  FOR UPDATE TO authenticated USING (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  );

-- Also allow super_admin to read hr_policies even if not branch member
DROP POLICY IF EXISTS "Branch members can read hr_policies" ON public.hr_policies;
CREATE POLICY "Branch members can read hr_policies" ON public.hr_policies
  FOR SELECT TO authenticated USING (
    public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id)
  );