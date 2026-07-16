
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
  prev_paid boolean := false;
BEGIN
  IF ot_month_v = submitted_month THEN
    RETURN QUERY SELECT submitted_month, false, true;
  ELSIF ot_month_v = next_month THEN
    RETURN QUERY SELECT next_month, false, true;
  ELSIF ot_month_v = prev_month THEN
    IF _branch_id IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM public.payroll_records
        WHERE branch_id = _branch_id
          AND year = EXTRACT(YEAR FROM prev_month)::int
          AND month = EXTRACT(MONTH FROM prev_month)::int
          AND status = 'paid'
      ) INTO prev_paid;
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM public.payroll_records
        WHERE year = EXTRACT(YEAR FROM prev_month)::int
          AND month = EXTRACT(MONTH FROM prev_month)::int
          AND status = 'paid'
      ) INTO prev_paid;
    END IF;
    IF prev_paid THEN
      RETURN QUERY SELECT submitted_month, true, true;
    ELSE
      RETURN QUERY SELECT prev_month, false, true;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::date, false, false;
  END IF;
END; $function$;

-- Block updates to OT rows whose payroll month is already Paid
CREATE OR REPLACE FUNCTION public.prevent_paid_payroll_ot_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_paid boolean := false;
BEGIN
  IF OLD.payroll_month IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.payroll_records
    WHERE branch_id = OLD.branch_id
      AND year = EXTRACT(YEAR FROM OLD.payroll_month)::int
      AND month = EXTRACT(MONTH FROM OLD.payroll_month)::int
      AND status = 'paid'
  ) INTO is_paid;
  IF is_paid AND (
       NEW.hours IS DISTINCT FROM OLD.hours
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.date IS DISTINCT FROM OLD.date
    OR NEW.payroll_month IS DISTINCT FROM OLD.payroll_month
    OR NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'Cannot modify overtime record: payroll % is already Paid', OLD.payroll_month;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_paid_payroll_ot_modification ON public.overtime_requests;
CREATE TRIGGER trg_prevent_paid_payroll_ot_modification
BEFORE UPDATE ON public.overtime_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_paid_payroll_ot_modification();
