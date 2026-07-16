-- Allow branch managers/admins to monitor all lesson plans in their branch
DROP POLICY IF EXISTS "Branch managers can view branch lesson plans" ON public.lesson_plans;
CREATE POLICY "Branch managers can view branch lesson plans"
ON public.lesson_plans
FOR SELECT
TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id));