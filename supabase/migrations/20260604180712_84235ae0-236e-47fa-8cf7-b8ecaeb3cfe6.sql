
DO $$
DECLARE
  r record; v_student_id uuid; v_indicators jsonb; v_checklist jsonb; v_ctx jsonb; v_notes text; v_assessor uuid;
BEGIN
  FOR r IN
    SELECT l.id AS lead_id, l.branch_id, l.child_name, l.pre_enrollment_assessment AS pa, l.created_by
    FROM public.leads l
    WHERE l.status = 'enrolled'
      AND l.pre_enrollment_assessment IS NOT NULL
      AND jsonb_typeof(l.pre_enrollment_assessment) = 'object'
  LOOP
    SELECT s.id INTO v_student_id
    FROM public.students s
    WHERE s.branch_id = r.branch_id
      AND (
        lower(coalesce(s.first_name,'') || ' ' || coalesce(s.last_name,'')) = lower(r.child_name)
        OR lower(coalesce(s.first_name,'')) = lower(split_part(r.child_name, ' ', 1))
      )
    ORDER BY s.created_at DESC LIMIT 1;

    IF v_student_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.baseline_assessments b WHERE b.student_id = v_student_id) THEN CONTINUE; END IF;

    v_indicators := coalesce(r.pa->'indicators', '{}'::jsonb);
    v_ctx := coalesce(r.pa->'context', '{}'::jsonb);

    SELECT jsonb_agg(jsonb_build_object(
              'category', split_part(key, '.', 1),
              'item', split_part(key, '.', 2),
              'score', value,
              'passed', (CASE WHEN (value)::text ~ '^[0-9]+$' AND (value)::text::int >= 3 THEN true ELSE false END)
           ))
    INTO v_checklist FROM jsonb_each(v_indicators);

    v_notes := concat_ws(E'\n\n',
      nullif(r.pa->>'teacher_notes',''),
      nullif(v_ctx->>'parent_goals',''),
      nullif(v_ctx->>'teacher_recommendation','')
    );

    v_assessor := coalesce(
      nullif(r.pa->>'assessed_by','')::uuid,
      r.created_by,
      (SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1)
    );

    INSERT INTO public.baseline_assessments (
      student_id, branch_id, assessed_by,
      motor_skills_score, language_score, socio_emotional_score, cognitive_score,
      checklist_responses, teacher_notes, lead_id, source, date_evaluated
    ) VALUES (
      v_student_id, r.branch_id, v_assessor,
      coalesce(round((r.pa->>'motor_skills_score')::numeric)::int, 3),
      coalesce(round((r.pa->>'language_score')::numeric)::int, 3),
      coalesce(round((r.pa->>'socio_emotional_score')::numeric)::int, 3),
      coalesce(round((r.pa->>'cognitive_score')::numeric)::int, 3),
      v_checklist,
      nullif(v_notes,''),
      r.lead_id,
      'pre_enrollment',
      current_date
    );
  END LOOP;
END$$;

CREATE TABLE IF NOT EXISTS public.child_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('parent','school')),
  title text NOT NULL,
  description text,
  target_domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  target_proficiency int CHECK (target_proficiency BETWEEN 1 AND 3),
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','paused')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_child_goals_student ON public.child_goals(student_id);
CREATE INDEX IF NOT EXISTS idx_child_goals_branch ON public.child_goals(branch_id);
CREATE INDEX IF NOT EXISTS idx_child_goals_domain ON public.child_goals(target_domain_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_goals TO authenticated;
GRANT ALL ON public.child_goals TO service_role;
ALTER TABLE public.child_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "child_goals read" ON public.child_goals FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id)
    OR EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id = child_goals.student_id AND ps.parent_id = auth.uid()));
CREATE POLICY "child_goals insert" ON public.child_goals FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "child_goals update" ON public.child_goals FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "child_goals delete" ON public.child_goals FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_child_goals_updated_at
  BEFORE UPDATE ON public.child_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.child_goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.child_goals(id) ON DELETE CASCADE,
  observation_id uuid REFERENCES public.student_observations(id) ON DELETE SET NULL,
  assessment_id uuid REFERENCES public.baseline_assessments(id) ON DELETE SET NULL,
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_child_goal_progress_goal ON public.child_goal_progress(goal_id);
CREATE INDEX IF NOT EXISTS idx_child_goal_progress_observation ON public.child_goal_progress(observation_id);
CREATE INDEX IF NOT EXISTS idx_child_goal_progress_assessment ON public.child_goal_progress(assessment_id);
GRANT SELECT, INSERT ON public.child_goal_progress TO authenticated;
GRANT ALL ON public.child_goal_progress TO service_role;
ALTER TABLE public.child_goal_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "child_goal_progress read" ON public.child_goal_progress FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.child_goals g WHERE g.id = child_goal_progress.goal_id
    AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), g.branch_id)
      OR EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id = g.student_id AND ps.parent_id = auth.uid()))));
CREATE POLICY "child_goal_progress insert" ON public.child_goal_progress FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.child_goals g WHERE g.id = child_goal_progress.goal_id
    AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), g.branch_id))));

CREATE OR REPLACE VIEW public.v_student_domain_rollup
WITH (security_invoker=on) AS
SELECT
  o.student_id, d.id AS domain_id, d.code AS domain_code, d.name AS domain_name,
  count(*) FILTER (WHERE o.observed_at >= (current_date - interval '30 days'))::int AS obs_30d,
  count(*) FILTER (WHERE o.observed_at >= (current_date - interval '60 days'))::int AS obs_60d,
  count(*) FILTER (WHERE o.observed_at >= (current_date - interval '90 days'))::int AS obs_90d,
  avg(CASE o.proficiency_level::text
        WHEN 'TP1' THEN 1 WHEN 'TP2' THEN 2 WHEN 'TP3' THEN 3
        ELSE NULL END
  ) FILTER (WHERE o.observed_at >= (current_date - interval '90 days'))::numeric(4,2) AS avg_prof_90d,
  max(o.observed_at) AS last_observed_at
FROM public.student_observations o
JOIN public.curriculum_standards cs ON cs.id = o.standard_id
JOIN public.learning_areas la ON la.id = cs.learning_area_id
JOIN public.development_domains d ON d.code = substring(la.code from 1 for 2)
GROUP BY o.student_id, d.id, d.code, d.name;
GRANT SELECT ON public.v_student_domain_rollup TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_autotag_observation_to_goals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_domain_id uuid;
BEGIN
  IF NEW.standard_id IS NULL THEN RETURN NEW; END IF;
  SELECT d.id INTO v_domain_id
  FROM public.curriculum_standards cs
  JOIN public.learning_areas la ON la.id = cs.learning_area_id
  JOIN public.development_domains d ON d.code = substring(la.code from 1 for 2)
  WHERE cs.id = NEW.standard_id LIMIT 1;
  IF v_domain_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.child_goal_progress (goal_id, observation_id, recorded_by, note)
  SELECT g.id, NEW.id, NEW.observed_by, 'Auto-linked from observation'
  FROM public.child_goals g
  WHERE g.student_id = NEW.student_id AND g.status = 'active' AND g.target_domain_id = v_domain_id;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_autotag_observation_to_goals ON public.student_observations;
CREATE TRIGGER trg_autotag_observation_to_goals
  AFTER INSERT ON public.student_observations
  FOR EACH ROW EXECUTE FUNCTION public.fn_autotag_observation_to_goals();
