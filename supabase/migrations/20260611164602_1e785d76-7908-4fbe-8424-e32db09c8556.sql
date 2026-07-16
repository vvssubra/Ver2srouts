
-- Batch 6D — Child Skill Progress rollup table + safe upsert RPC

CREATE TABLE IF NOT EXISTS public.child_skill_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  indicator_id uuid,
  indicator_label text NOT NULL,
  normalized_indicator_label text NOT NULL,
  current_status text NOT NULL DEFAULT 'not_yet'
    CHECK (current_status IN ('not_yet','emerging','developing','secure')),
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at  timestamptz NOT NULL DEFAULT now(),
  last_update_id uuid,
  last_skill_id  uuid,
  evidence_count integer NOT NULL DEFAULT 0,
  confidence_score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Forward-only progress is enforced in the RPC, not via CHECK.

CREATE INDEX IF NOT EXISTS idx_csp_student         ON public.child_skill_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_csp_student_domain  ON public.child_skill_progress(student_id, domain_id);
CREATE INDEX IF NOT EXISTS idx_csp_last_observed   ON public.child_skill_progress(student_id, last_observed_at DESC);

-- Uniqueness (partial): one row per (student, indicator_id) when present;
-- otherwise one row per (student, domain, normalized free-text label).
CREATE UNIQUE INDEX IF NOT EXISTS uq_csp_student_indicator
  ON public.child_skill_progress(student_id, indicator_id)
  WHERE indicator_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_csp_student_domain_label
  ON public.child_skill_progress(student_id, domain_id, normalized_indicator_label)
  WHERE indicator_id IS NULL;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_skill_progress TO authenticated;
GRANT ALL ON public.child_skill_progress TO service_role;

ALTER TABLE public.child_skill_progress ENABLE ROW LEVEL SECURITY;

-- Parents see only progress rows for their approved children.
CREATE POLICY "Parents view their children's progress"
ON public.child_skill_progress FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = child_skill_progress.student_id
      AND ps.parent_id  = auth.uid()
      AND ps.status     = 'approved'
  )
);

-- Branch staff can read progress rows for students in their branch.
CREATE POLICY "Branch staff view branch progress"
ON public.child_skill_progress FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_skill_progress.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
);

-- Branch staff can insert/update/delete progress for branch students
-- (the app uses the RPC, but writes via service_role/staff are needed too).
CREATE POLICY "Branch staff write branch progress"
ON public.child_skill_progress FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_skill_progress.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
);

CREATE POLICY "Branch staff update branch progress"
ON public.child_skill_progress FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_skill_progress.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = child_skill_progress.student_id
      AND public.is_member_of_branch(auth.uid(), s.branch_id)
  )
);

CREATE POLICY "Super admins manage all progress"
ON public.child_skill_progress FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Updated-at trigger
CREATE TRIGGER trg_csp_updated_at
BEFORE UPDATE ON public.child_skill_progress
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────
-- RPC: safe forward-only upsert for child skill progress
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_child_skill_progress(
  p_student_id uuid,
  p_update_id  uuid,
  p_skill_id   uuid,
  p_domain_id  uuid,
  p_indicator_id uuid,
  p_indicator_label text,
  p_proficiency_level text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Resolve branch for permission check.
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

  -- Find existing row using same uniqueness logic as the partial indexes.
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
      last_update_id, last_skill_id, evidence_count
    ) VALUES (
      p_student_id, p_domain_id, p_indicator_id, v_norm_label, v_norm,
      CASE WHEN v_level_in >= 0 THEN p_proficiency_level ELSE 'not_yet' END,
      now(), now(), p_update_id, p_skill_id, 1
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  -- Idempotency: same (update_id, skill_id) — do nothing but touch last_observed.
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
         indicator_label  = CASE WHEN indicator_id IS NULL THEN v_norm_label ELSE indicator_label END
   WHERE id = v_existing.id;

  RETURN v_existing.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_child_skill_progress(uuid,uuid,uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_child_skill_progress(uuid,uuid,uuid,uuid,uuid,text,text) TO service_role;
