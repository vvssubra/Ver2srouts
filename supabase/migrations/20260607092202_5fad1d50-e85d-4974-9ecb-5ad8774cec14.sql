
-- 1. event_kind enum
DO $$ BEGIN
  CREATE TYPE public.calendar_event_kind AS ENUM (
    'public_holiday','term_break','replacement_holiday',
    'staff_training','school_activity','ptm_day','assessment_window','normal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add event_kind to both tables (additive, nullable, with default)
ALTER TABLE public.school_holidays
  ADD COLUMN IF NOT EXISTS event_kind public.calendar_event_kind;
ALTER TABLE public.branch_events
  ADD COLUMN IF NOT EXISTS event_kind public.calendar_event_kind;

-- 3. Backfill event_kind from existing event_type values
UPDATE public.school_holidays SET event_kind = CASE
  WHEN event_type IN ('public_holiday','holiday') THEN 'public_holiday'::public.calendar_event_kind
  WHEN event_type IN ('term_holiday','term_break','sem_break') THEN 'term_break'::public.calendar_event_kind
  WHEN event_type IN ('reward_holiday','replacement_holiday') THEN 'replacement_holiday'::public.calendar_event_kind
  WHEN event_type IN ('training','staff_training') THEN 'staff_training'::public.calendar_event_kind
  WHEN event_type IN ('activity','school_activity','event') THEN 'school_activity'::public.calendar_event_kind
  WHEN event_type IN ('ptm','ptm_day') THEN 'ptm_day'::public.calendar_event_kind
  WHEN event_type IN ('assessment','assessment_window') THEN 'assessment_window'::public.calendar_event_kind
  ELSE 'public_holiday'::public.calendar_event_kind
END WHERE event_kind IS NULL;

UPDATE public.branch_events SET event_kind = CASE
  WHEN event_type IN ('public_holiday','holiday') THEN 'public_holiday'::public.calendar_event_kind
  WHEN event_type IN ('term_holiday','term_break','sem_break') THEN 'term_break'::public.calendar_event_kind
  WHEN event_type IN ('reward_holiday','replacement_holiday') THEN 'replacement_holiday'::public.calendar_event_kind
  WHEN event_type IN ('training','staff_training') THEN 'staff_training'::public.calendar_event_kind
  WHEN event_type IN ('activity','school_activity','event') THEN 'school_activity'::public.calendar_event_kind
  WHEN event_type IN ('ptm','ptm_day') THEN 'ptm_day'::public.calendar_event_kind
  WHEN event_type IN ('assessment','assessment_window') THEN 'assessment_window'::public.calendar_event_kind
  ELSE 'school_activity'::public.calendar_event_kind
END WHERE event_kind IS NULL;

-- 4. Cancellation fields on daily_timetable_slots
ALTER TABLE public.daily_timetable_slots
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 5. Unified view v_school_calendar (UNION of both tables, branch-scoped)
CREATE OR REPLACE VIEW public.v_school_calendar AS
SELECT
  sh.id                                                AS source_id,
  'school_holidays'::text                              AS source_table,
  ay.branch_id                                         AS branch_id,
  sh.academic_year_id                                  AS academic_year_id,
  sh.event_date                                        AS start_date,
  COALESCE(sh.end_date, sh.event_date)                 AS end_date,
  sh.event_name                                        AS name,
  sh.event_kind                                        AS event_kind,
  sh.is_paid                                           AS is_paid,
  sh.affects_attendance                                AS affects_attendance,
  CASE
    WHEN sh.event_kind IN ('public_holiday','term_break','replacement_holiday','staff_training') THEN true
    ELSE false
  END                                                  AS school_closed
FROM public.school_holidays sh
JOIN public.academic_years ay ON ay.id = sh.academic_year_id
UNION ALL
SELECT
  be.id                                                AS source_id,
  'branch_events'::text                                AS source_table,
  be.branch_id                                         AS branch_id,
  NULL::uuid                                           AS academic_year_id,
  be.event_date                                        AS start_date,
  COALESCE(be.end_date, be.event_date)                 AS end_date,
  be.event_name                                        AS name,
  be.event_kind                                        AS event_kind,
  be.is_paid                                           AS is_paid,
  be.affects_attendance                                AS affects_attendance,
  CASE
    WHEN be.event_kind IN ('public_holiday','term_break','replacement_holiday','staff_training') THEN true
    ELSE false
  END                                                  AS school_closed
FROM public.branch_events be;

GRANT SELECT ON public.v_school_calendar TO authenticated;
GRANT SELECT ON public.v_school_calendar TO service_role;

-- 6. Trigger fn: when a closure row is inserted/updated, cancel overlapping daily slots
CREATE OR REPLACE FUNCTION public.apply_calendar_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_start date;
  v_end date;
  v_name text;
  v_kind public.calendar_event_kind;
  v_closed boolean;
BEGIN
  v_kind := NEW.event_kind;
  v_closed := v_kind IN ('public_holiday','term_break','replacement_holiday','staff_training');
  IF NOT v_closed THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'school_holidays' THEN
    SELECT ay.branch_id INTO v_branch_id FROM public.academic_years ay WHERE ay.id = NEW.academic_year_id;
  ELSE
    v_branch_id := NEW.branch_id;
  END IF;

  v_start := NEW.event_date;
  v_end := COALESCE(NEW.end_date, NEW.event_date);
  v_name := NEW.event_name;

  IF v_branch_id IS NOT NULL THEN
    UPDATE public.daily_timetable_slots
    SET is_cancelled = true,
        cancellation_reason = v_name
    WHERE branch_id = v_branch_id
      AND slot_date BETWEEN v_start AND v_end
      AND is_cancelled = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sh_apply_cancellation ON public.school_holidays;
CREATE TRIGGER trg_sh_apply_cancellation
AFTER INSERT OR UPDATE ON public.school_holidays
FOR EACH ROW EXECUTE FUNCTION public.apply_calendar_cancellation();

DROP TRIGGER IF EXISTS trg_be_apply_cancellation ON public.branch_events;
CREATE TRIGGER trg_be_apply_cancellation
AFTER INSERT OR UPDATE ON public.branch_events
FOR EACH ROW EXECUTE FUNCTION public.apply_calendar_cancellation();
