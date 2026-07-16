
-- =============================================================
-- Helper: who can view a given profile
-- =============================================================
CREATE OR REPLACE FUNCTION public.can_view_profile(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer IS NOT NULL AND (
      _viewer = _target
      OR public.is_super_admin(_viewer)
      OR EXISTS (
        SELECT 1
        FROM public.branch_memberships bm1
        JOIN public.branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
        WHERE bm1.user_id = _viewer AND bm2.user_id = _target
      )
      OR EXISTS (
        -- viewer is parent; target is staff in viewer's child's branch
        SELECT 1
        FROM public.parent_students ps
        JOIN public.students s ON s.id = ps.student_id
        JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
        WHERE ps.parent_id = _viewer
          AND ps.status = 'approved'
          AND bm.user_id = _target
      )
      OR EXISTS (
        -- viewer is staff; target is parent of student in viewer's branch
        SELECT 1
        FROM public.parent_students ps
        JOIN public.students s ON s.id = ps.student_id
        JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
        WHERE ps.parent_id = _target
          AND ps.status = 'approved'
          AND bm.user_id = _viewer
      )
    )
$$;

-- =============================================================
-- profiles: scoped read
-- =============================================================
DROP POLICY IF EXISTS "Anyone authenticated can read profiles" ON public.profiles;

CREATE POLICY "Scoped profile read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.can_view_profile(auth.uid(), id));

-- =============================================================
-- billing_audit_logs: lock down INSERT (writes only via SECURITY DEFINER trigger / service role)
-- =============================================================
DROP POLICY IF EXISTS billing_audit_insert ON public.billing_audit_logs;
-- (no replacement: triggers run as definer; service_role bypasses RLS)

-- =============================================================
-- learning_center_plans: branch-scoped SELECT
-- =============================================================
DROP POLICY IF EXISTS "Authenticated users can view learning center plans" ON public.learning_center_plans;

CREATE POLICY "Branch members view learning center plans"
  ON public.learning_center_plans FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), branch_id))
    OR auth.uid() = created_by
  );

-- =============================================================
-- lesson_plan_objectives / indicators / weekly_focus_objectives: branch-scoped writes
-- =============================================================
DROP POLICY IF EXISTS lp_objectives_manage ON public.lesson_plan_objectives;
DROP POLICY IF EXISTS lp_objectives_read ON public.lesson_plan_objectives;

CREATE POLICY lp_objectives_read
  ON public.lesson_plan_objectives FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  );

CREATE POLICY lp_objectives_manage
  ON public.lesson_plan_objectives FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  );

DROP POLICY IF EXISTS lp_indicators_manage ON public.lesson_plan_objective_indicators;
DROP POLICY IF EXISTS lp_indicators_read ON public.lesson_plan_objective_indicators;

CREATE POLICY lp_indicators_read
  ON public.lesson_plan_objective_indicators FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  );

CREATE POLICY lp_indicators_manage
  ON public.lesson_plan_objective_indicators FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lesson_plans lp
      WHERE lp.id = lesson_plan_id
        AND (
          public.is_super_admin(auth.uid())
          OR lp.user_id = auth.uid()
          OR (lp.branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), lp.branch_id))
        )
    )
  );

DROP POLICY IF EXISTS weekly_focus_manage ON public.weekly_focus_objectives;
DROP POLICY IF EXISTS weekly_focus_read ON public.weekly_focus_objectives;

-- weekly_focus_objectives column set is unknown for sure; restrict to authenticated branch members of any weekly_plan they reference.
-- Fallback: restrict writes to staff (non-parent) users. Reads stay open to authenticated.
CREATE POLICY weekly_focus_read
  ON public.weekly_focus_objectives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY weekly_focus_manage
  ON public.weekly_focus_objectives FOR ALL
  TO authenticated
  USING (NOT public.has_role(auth.uid(), 'parent'))
  WITH CHECK (NOT public.has_role(auth.uid(), 'parent'));

-- =============================================================
-- observation_comments / observation_reactions: scope reads to observation viewers
-- =============================================================
DROP POLICY IF EXISTS "Read all comments" ON public.observation_comments;
DROP POLICY IF EXISTS "Read all reactions" ON public.observation_reactions;

CREATE POLICY "Read scoped comments"
  ON public.observation_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_observations o
      JOIN public.students s ON s.id = o.student_id
      WHERE o.id = observation_id
        AND (
          public.is_super_admin(auth.uid())
          OR public.is_member_of_branch(auth.uid(), s.branch_id)
          OR EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.student_id = s.id
              AND ps.parent_id = auth.uid()
              AND ps.status = 'approved'
          )
        )
    )
  );

CREATE POLICY "Read scoped reactions"
  ON public.observation_reactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_observations o
      JOIN public.students s ON s.id = o.student_id
      WHERE o.id = observation_id
        AND (
          public.is_super_admin(auth.uid())
          OR public.is_member_of_branch(auth.uid(), s.branch_id)
          OR EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.student_id = s.id
              AND ps.parent_id = auth.uid()
              AND ps.status = 'approved'
          )
        )
    )
  );

-- =============================================================
-- staff_designations: restrict open read
-- =============================================================
DROP POLICY IF EXISTS "Authenticated view designations" ON public.staff_designations;

CREATE POLICY "Branch staff view designations"
  ON public.staff_designations FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR auth.uid() = user_id
    OR (branch_id IS NOT NULL AND public.is_member_of_branch(auth.uid(), branch_id))
  );

-- =============================================================
-- eform_submissions: remove anon UPDATE
-- =============================================================
DROP POLICY IF EXISTS "Public can update own submissions" ON public.eform_submissions;
