
-- Allow branch managers to update lesson plans in their branch (for review actions)
CREATE POLICY "Branch managers can update branch lesson plans"
ON public.lesson_plans
FOR UPDATE
USING (is_branch_manager(auth.uid(), branch_id));

-- Allow super admins to update any lesson plan
CREATE POLICY "Super admins can update all lesson plans"
ON public.lesson_plans
FOR UPDATE
USING (is_super_admin(auth.uid()));
