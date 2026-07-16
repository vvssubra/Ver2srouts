ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS overtime_type text DEFAULT 'normal';

-- Add a validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_overtime_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.overtime_type NOT IN ('normal', 'rest_day', 'public_holiday') THEN
    RAISE EXCEPTION 'Invalid overtime_type: %. Must be normal, rest_day, or public_holiday.', NEW.overtime_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_overtime_type
BEFORE INSERT OR UPDATE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_overtime_type();