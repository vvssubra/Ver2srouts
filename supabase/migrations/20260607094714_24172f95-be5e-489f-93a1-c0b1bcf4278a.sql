-- Relax timetable write RLS to anyone with /timetables managed route (still branch-isolated)
DROP POLICY IF EXISTS "Branch managers can manage daily slots" ON public.daily_timetable_slots;
CREATE POLICY "Timetable managers can manage daily slots"
ON public.daily_timetable_slots
FOR ALL
TO authenticated
USING (
  is_member_of_branch(auth.uid(), branch_id)
  AND (
    public.can_manage_route(auth.uid(), '/timetables')
    OR is_branch_manager(auth.uid(), branch_id)
    OR has_role(auth.uid(), 'franchisee'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  )
)
WITH CHECK (
  is_member_of_branch(auth.uid(), branch_id)
  AND (
    public.can_manage_route(auth.uid(), '/timetables')
    OR is_branch_manager(auth.uid(), branch_id)
    OR has_role(auth.uid(), 'franchisee'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR is_super_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Branch managers can manage timetable slots" ON public.timetable_slots;
CREATE POLICY "Timetable managers can manage template slots"
ON public.timetable_slots
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = timetable_slots.class_id
      AND is_member_of_branch(auth.uid(), c.branch_id)
      AND (
        public.can_manage_route(auth.uid(), '/timetables')
        OR is_branch_manager(auth.uid(), c.branch_id)
        OR has_role(auth.uid(), 'franchisee'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR is_super_admin(auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = timetable_slots.class_id
      AND is_member_of_branch(auth.uid(), c.branch_id)
      AND (
        public.can_manage_route(auth.uid(), '/timetables')
        OR is_branch_manager(auth.uid(), c.branch_id)
        OR has_role(auth.uid(), 'franchisee'::app_role)
        OR has_role(auth.uid(), 'admin'::app_role)
        OR is_super_admin(auth.uid())
      )
  )
);