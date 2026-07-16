-- 1) Trigger: auto-set portfolio_candidate=true on child_updates when milestone OR proficiency improves
CREATE OR REPLACE FUNCTION public.auto_pin_portfolio_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev_level text;
  v_levels text[] := ARRAY['emerging','developing','consistent'];
  v_new_idx int;
  v_prev_idx int;
BEGIN
  -- If teacher already explicitly set it true, keep it.
  IF COALESCE(NEW.portfolio_candidate, false) = true THEN
    RETURN NEW;
  END IF;

  -- Rule A: milestone -> auto-pin
  IF COALESCE(NEW.milestone_flag, false) = true THEN
    NEW.portfolio_candidate := true;
    RETURN NEW;
  END IF;

  -- Rule B: proficiency improved vs previous record for same student + domain
  IF NEW.student_id IS NOT NULL
     AND NEW.domain_id IS NOT NULL
     AND NEW.proficiency_level IS NOT NULL THEN
    SELECT proficiency_level
      INTO v_prev_level
    FROM public.child_updates
    WHERE student_id = NEW.student_id
      AND domain_id  = NEW.domain_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND proficiency_level IS NOT NULL
    ORDER BY activity_date DESC, created_at DESC
    LIMIT 1;

    IF v_prev_level IS NOT NULL THEN
      v_new_idx  := COALESCE(array_position(v_levels, NEW.proficiency_level), 0);
      v_prev_idx := COALESCE(array_position(v_levels, v_prev_level), 0);
      IF v_new_idx > 0 AND v_prev_idx > 0 AND v_new_idx > v_prev_idx THEN
        NEW.portfolio_candidate := true;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_pin_portfolio_candidate ON public.child_updates;
CREATE TRIGGER trg_auto_pin_portfolio_candidate
BEFORE INSERT ON public.child_updates
FOR EACH ROW
EXECUTE FUNCTION public.auto_pin_portfolio_candidate();

-- 2) Allow branch staff to revoke (delete) pending parent_invitations
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='parent_invitations') THEN
    DROP POLICY IF EXISTS "Branch staff revoke parent invitations" ON public.parent_invitations;
    CREATE POLICY "Branch staff revoke parent invitations"
      ON public.parent_invitations
      FOR DELETE
      TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR public.is_member_of_branch(auth.uid(), branch_id)
      );
  END IF;
END $$;