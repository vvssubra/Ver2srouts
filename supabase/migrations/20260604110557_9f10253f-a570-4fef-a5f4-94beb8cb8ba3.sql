
-- 1. lesson_plan_reviews: replace permissive ALL/true policy with branch-scoped policy
DROP POLICY IF EXISTS "Branch managers can manage reviews" ON public.lesson_plan_reviews;

CREATE POLICY "Branch staff can read lesson plan reviews"
ON public.lesson_plan_reviews
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    JOIN public.branch_memberships bm ON bm.branch_id = lp.branch_id
    WHERE lp.id = lesson_plan_reviews.lesson_plan_id
      AND bm.user_id = auth.uid()
  )
);

CREATE POLICY "Branch staff can insert lesson plan reviews"
ON public.lesson_plan_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  reviewer_id = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      JOIN public.branch_memberships bm ON bm.branch_id = lp.branch_id
      WHERE lp.id = lesson_plan_reviews.lesson_plan_id
        AND bm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Reviewers and admins can update lesson plan reviews"
ON public.lesson_plan_reviews
FOR UPDATE
TO authenticated
USING (
  reviewer_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    JOIN public.branch_memberships bm ON bm.branch_id = lp.branch_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE lp.id = lesson_plan_reviews.lesson_plan_id
      AND bm.user_id = auth.uid()
      AND ur.role IN ('admin','franchisee')
  )
)
WITH CHECK (
  reviewer_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    JOIN public.branch_memberships bm ON bm.branch_id = lp.branch_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE lp.id = lesson_plan_reviews.lesson_plan_id
      AND bm.user_id = auth.uid()
      AND ur.role IN ('admin','franchisee')
  )
);

CREATE POLICY "Reviewers and admins can delete lesson plan reviews"
ON public.lesson_plan_reviews
FOR DELETE
TO authenticated
USING (
  reviewer_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    JOIN public.branch_memberships bm ON bm.branch_id = lp.branch_id
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE lp.id = lesson_plan_reviews.lesson_plan_id
      AND bm.user_id = auth.uid()
      AND ur.role IN ('admin','franchisee')
  )
);

-- 2. weekly_focus_objectives: scope ALL writes to branch members of the week plan
DROP POLICY IF EXISTS weekly_focus_manage ON public.weekly_focus_objectives;

CREATE POLICY "weekly_focus_manage_branch_scoped"
ON public.weekly_focus_objectives
FOR ALL
TO authenticated
USING (
  NOT public.has_role(auth.uid(), 'parent'::app_role)
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.curriculum_week_plans wp
      WHERE wp.id = weekly_focus_objectives.week_plan_id
        AND public.is_member_of_branch(auth.uid(), wp.branch_id)
    )
  )
)
WITH CHECK (
  NOT public.has_role(auth.uid(), 'parent'::app_role)
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.curriculum_week_plans wp
      WHERE wp.id = weekly_focus_objectives.week_plan_id
        AND public.is_member_of_branch(auth.uid(), wp.branch_id)
    )
  )
);

-- 3. learning_journey_media: scope SELECT to branch members and approved parents
DROP POLICY IF EXISTS "Anyone can read journey media for visible entries" ON public.learning_journey_media;

CREATE POLICY "Branch staff and parents can read journey media"
ON public.learning_journey_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.daily_learning_journey_entries e
    WHERE e.id = learning_journey_media.journey_entry_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.is_student_in_user_branch(auth.uid(), e.student_id)
        OR (
          e.visible_to_parent = true
          AND EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.student_id = e.student_id
              AND ps.parent_id = auth.uid()
              AND ps.status = 'approved'
          )
        )
      )
  )
);

-- 4. parent_welcome_email_sent: restrict INSERT to service_role or branch admins
DROP POLICY IF EXISTS "Service writes welcome sent log" ON public.parent_welcome_email_sent;

CREATE POLICY "Admins can write welcome sent log"
ON public.parent_welcome_email_sent
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'franchisee'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure service_role can always insert (used by triggers/edge functions)
GRANT INSERT ON public.parent_welcome_email_sent TO service_role;
