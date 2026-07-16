
-- Refine compute_payroll_month: for late prev-month OT, walk forward to next OPEN payroll
-- (skipping any future month already approved/paid). Also enforce submission window
-- authoritatively via a BEFORE INSERT/UPDATE trigger on overtime_requests.

CREATE OR REPLACE FUNCTION public.compute_payroll_month(_ot_date date, _submitted_at timestamp with time zone, _branch_id uuid DEFAULT NULL)
RETURNS TABLE(payroll_month date, is_late boolean, is_allowed boolean)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  submitted_month date := date_trunc('month', _submitted_at AT TIME ZONE 'UTC')::date;
  ot_month_v date := date_trunc('month', _ot_date)::date;
  prev_month date := (submitted_month - INTERVAL '1 month')::date;
  next_month date := (submitted_month + INTERVAL '1 month')::date;
  prev_status text;
  candidate date;
  candidate_status text;
  guard int := 0;
BEGIN
  -- Current month -> normal
  IF ot_month_v = submitted_month THEN
    RETURN QUERY SELECT submitted_month, false, true;
    RETURN;
  END IF;

  -- Next month (advance booking) -> normal
  IF ot_month_v = next_month THEN
    RETURN QUERY SELECT next_month, false, true;
    RETURN;
  END IF;

  -- Previous month -> on-time if prev payroll still open, else late and roll forward
  IF ot_month_v = prev_month THEN
    SELECT lower(coalesce(status::text, ''))
      INTO prev_status
      FROM public.payroll_records
     WHERE (_branch_id IS NULL OR branch_id = _branch_id)
       AND year  = EXTRACT(YEAR  FROM prev_month)::int
       AND month = EXTRACT(MONTH FROM prev_month)::int
     ORDER BY (status = 'paid') DESC NULLS LAST, updated_at DESC NULLS LAST
     LIMIT 1;

    IF prev_status IS NULL OR prev_status IN ('draft','pending','processing') THEN
      RETURN QUERY SELECT prev_month, false, true;
      RETURN;
    END IF;

    -- Late: walk forward month-by-month to the first non-paid/non-approved payroll cycle
    candidate := submitted_month;
    LOOP
      guard := guard + 1;
      EXIT WHEN guard > 24;
      SELECT lower(coalesce(status::text, ''))
        INTO candidate_status
        FROM public.payroll_records
       WHERE (_branch_id IS NULL OR branch_id = _branch_id)
         AND year  = EXTRACT(YEAR  FROM candidate)::int
         AND month = EXTRACT(MONTH FROM candidate)::int
       ORDER BY (status = 'paid') DESC NULLS LAST, updated_at DESC NULLS LAST
       LIMIT 1;
      IF candidate_status IS NULL OR candidate_status NOT IN ('approved','paid') THEN
        RETURN QUERY SELECT candidate, true, true;
        RETURN;
      END IF;
      candidate := (candidate + INTERVAL '1 month')::date;
    END LOOP;

    -- Fallback: assign submitted month
    RETURN QUERY SELECT submitted_month, true, true;
    RETURN;
  END IF;

  -- Outside allowed window
  RETURN QUERY SELECT NULL::date, false, false;
END;
$function$;

-- Authoritative server-side enforcement of the OT submission window.
-- Super admins may bypass (back-dated corrections).
CREATE OR REPLACE FUNCTION public.enforce_ot_submission_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  computed RECORD;
  submitted_ts timestamptz;
  bypass boolean := false;
BEGIN
  -- Only validate when the OT date or the submission timestamp changes (or on insert)
  IF TG_OP = 'UPDATE'
     AND NEW.date = OLD.date
     AND coalesce(NEW.submitted_at, OLD.submitted_at) = OLD.submitted_at THEN
    RETURN NEW;
  END IF;

  -- Super admin bypass
  IF auth.uid() IS NOT NULL THEN
    SELECT public.has_role(auth.uid(), 'super_admin'::app_role) INTO bypass;
  END IF;
  IF bypass THEN
    RETURN NEW;
  END IF;

  submitted_ts := coalesce(NEW.submitted_at, now());

  SELECT * INTO computed
    FROM public.compute_payroll_month(NEW.date, submitted_ts, NEW.branch_id);

  IF NOT computed.is_allowed THEN
    RAISE EXCEPTION 'OT date % is outside the allowed submission window (previous, current, or next month only).', NEW.date
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ot_submission_window ON public.overtime_requests;
CREATE TRIGGER trg_enforce_ot_submission_window
BEFORE INSERT OR UPDATE OF date, submitted_at ON public.overtime_requests
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ot_submission_window();
