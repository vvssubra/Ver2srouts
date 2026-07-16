
-- Additive nullable mapping columns on Learning Journey skill rows.
ALTER TABLE public.child_update_skills
  ADD COLUMN IF NOT EXISTS curriculum_objective_id uuid
    REFERENCES public.curriculum_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_indicator_id uuid
    REFERENCES public.curriculum_objective_indicators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_child_update_skills_curriculum_objective
  ON public.child_update_skills(curriculum_objective_id)
  WHERE curriculum_objective_id IS NOT NULL;

-- Additive nullable mapping columns on the per-child rollup.
ALTER TABLE public.child_skill_progress
  ADD COLUMN IF NOT EXISTS curriculum_objective_id uuid
    REFERENCES public.curriculum_objectives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS curriculum_indicator_id uuid
    REFERENCES public.curriculum_objective_indicators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_csp_curriculum_objective
  ON public.child_skill_progress(student_id, curriculum_objective_id)
  WHERE curriculum_objective_id IS NOT NULL;

-- Extend RPC to persist catalogue mapping when supplied. Forward-only
-- proficiency, idempotency on (update_id, skill_id), evidence_count and
-- RLS-equivalent permission check all preserved. New params default to
-- NULL so all existing call sites continue to work unchanged.
CREATE OR REPLACE FUNCTION public.record_child_skill_progress(
  p_student_id uuid,
  p_update_id uuid,
  p_skill_id uuid,
  p_domain_id uuid,
  p_indicator_id uuid,
  p_indicator_label text,
  p_proficiency_level text,
  p_curriculum_objective_id uuid DEFAULT NULL,
  p_curriculum_indicator_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_id uuid;
  v_caller    uuid := auth.uid();
  v_norm      text;
  v_level_in  int;
  v_level_cur int;
  v_status_map constant jsonb := '{"not_yet":0,"emerging":1,"developing":2,"consistent":3,"secure":3}'::jsonb;
  v_existing  public.child_skill_progress;
  v_id        uuid;
  v_norm_label text;
BEGIN
  IF p_student_id IS NULL OR p_proficiency_level IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT branch_id INTO v_branch_id FROM public.students WHERE id = p_student_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
  IF NOT (public.is_super_admin(v_caller) OR public.is_member_of_branch(v_caller, v_branch_id)) THEN
    RAISE EXCEPTION 'Not authorised for this student';
  END IF;

  v_level_in := COALESCE((v_status_map ->> p_proficiency_level)::int, 0);
  v_norm_label := COALESCE(NULLIF(trim(p_indicator_label), ''), 'Untagged skill');
  v_norm := lower(v_norm_label);

  IF p_indicator_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.child_skill_progress
     WHERE student_id = p_student_id AND indicator_id = p_indicator_id
     LIMIT 1;
  ELSE
    SELECT * INTO v_existing FROM public.child_skill_progress
     WHERE student_id = p_student_id
       AND indicator_id IS NULL
       AND domain_id IS NOT DISTINCT FROM p_domain_id
       AND normalized_indicator_label = v_norm
     LIMIT 1;
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.child_skill_progress (
      student_id, domain_id, indicator_id, indicator_label, normalized_indicator_label,
      current_status, first_observed_at, last_observed_at,
      last_update_id, last_skill_id, evidence_count,
      curriculum_objective_id, curriculum_indicator_id
    ) VALUES (
      p_student_id, p_domain_id, p_indicator_id, v_norm_label, v_norm,
      CASE WHEN v_level_in >= 0 THEN p_proficiency_level ELSE 'not_yet' END,
      now(), now(), p_update_id, p_skill_id, 1,
      p_curriculum_objective_id, p_curriculum_indicator_id
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF v_existing.last_update_id IS NOT DISTINCT FROM p_update_id
     AND v_existing.last_skill_id IS NOT DISTINCT FROM p_skill_id THEN
    UPDATE public.child_skill_progress
       SET last_observed_at = now()
     WHERE id = v_existing.id;
    RETURN v_existing.id;
  END IF;

  v_level_cur := COALESCE((v_status_map ->> v_existing.current_status)::int, 0);

  UPDATE public.child_skill_progress
     SET current_status   = CASE WHEN v_level_in > v_level_cur
                                  THEN p_proficiency_level
                                  ELSE current_status END,
         last_observed_at = now(),
         last_update_id   = p_update_id,
         last_skill_id    = p_skill_id,
         evidence_count   = evidence_count + 1,
         domain_id        = COALESCE(domain_id, p_domain_id),
         indicator_label  = CASE WHEN indicator_id IS NULL THEN v_norm_label ELSE indicator_label END,
         curriculum_objective_id = COALESCE(curriculum_objective_id, p_curriculum_objective_id),
         curriculum_indicator_id = COALESCE(curriculum_indicator_id, p_curriculum_indicator_id)
   WHERE id = v_existing.id;

  RETURN v_existing.id;
END;
$function$;
