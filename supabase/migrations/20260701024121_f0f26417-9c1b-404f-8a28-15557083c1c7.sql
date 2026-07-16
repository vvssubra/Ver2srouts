-- Auto-close a stale open attendance record for Mariah Binti Rahim.
-- The record was left open at a branch she is no longer a member of,
-- which blocks new clock-in attempts. Preserve history + audit log.

DO $$
DECLARE
  v_att_id uuid := '24613d21-aff8-4216-82be-51452889fa77';
  v_user_id uuid := '00972ffc-7811-4ff7-b129-341f77cb6a0f';
  v_old jsonb;
  v_new_clock_out timestamptz;
BEGIN
  SELECT to_jsonb(sa.*) INTO v_old FROM public.staff_attendance sa WHERE id = v_att_id;
  IF v_old IS NULL THEN RAISE NOTICE 'Record not found, nothing to do'; RETURN; END IF;
  IF (v_old->>'clock_out') IS NOT NULL THEN RAISE NOTICE 'Already closed, nothing to do'; RETURN; END IF;

  -- Close at same instant as clock_in (0 duration) so no phantom hours are recorded.
  v_new_clock_out := (v_old->>'clock_in')::timestamptz;

  UPDATE public.staff_attendance
     SET clock_out = v_new_clock_out,
         notes = COALESCE(notes || E'\n', '') ||
                 '[System] Auto-closed on ' || to_char(now(), 'YYYY-MM-DD') ||
                 ': record was left open at a previous branch after reassignment, blocking new clock-in.'
   WHERE id = v_att_id;

  INSERT INTO public.staff_attendance_audit_log
    (attendance_id, action, changed_by, reason, old_values, new_values)
  VALUES
    (v_att_id, 'update', v_user_id,
     'System auto-close: stale open record at previous branch was blocking clock-in.',
     v_old,
     jsonb_build_object('clock_out', v_new_clock_out));
END $$;