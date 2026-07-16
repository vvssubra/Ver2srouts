
DROP POLICY IF EXISTS "Branch managers can manage daily slots" ON public.daily_timetable_slots;
CREATE POLICY "Branch managers can manage daily slots"
ON public.daily_timetable_slots FOR ALL TO authenticated
USING (
  is_branch_manager(auth.uid(), branch_id)
  OR has_role(auth.uid(), 'franchisee'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR is_super_admin(auth.uid())
)
WITH CHECK (
  is_branch_manager(auth.uid(), branch_id)
  OR has_role(auth.uid(), 'franchisee'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR is_super_admin(auth.uid())
);
