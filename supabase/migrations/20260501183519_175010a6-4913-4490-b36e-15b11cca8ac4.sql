
ALTER TABLE public.child_updates
  ADD COLUMN IF NOT EXISTS subject_name text;

CREATE INDEX IF NOT EXISTS idx_child_updates_subject
  ON public.child_updates(subject_name);

-- Backfill from linked timetable slot
UPDATE public.child_updates cu
SET subject_name = ts.subject_name
FROM public.timetable_slots ts
WHERE cu.subject_name IS NULL
  AND cu.source_timetable_slot_id = ts.id
  AND ts.subject_name IS NOT NULL;

-- Backfill from linked daily timetable slot (if same id namespace overlaps)
UPDATE public.child_updates cu
SET subject_name = dts.subject_name
FROM public.daily_timetable_slots dts
WHERE cu.subject_name IS NULL
  AND cu.source_timetable_slot_id = dts.id
  AND dts.subject_name IS NOT NULL;

-- Auto-fill subject_name when a moment is created/updated with a slot reference
CREATE OR REPLACE FUNCTION public.fill_child_update_subject()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subject text;
BEGIN
  IF NEW.subject_name IS NOT NULL AND NEW.subject_name <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source_timetable_slot_id IS NOT NULL THEN
    SELECT subject_name INTO v_subject
    FROM public.timetable_slots
    WHERE id = NEW.source_timetable_slot_id
    LIMIT 1;

    IF v_subject IS NULL THEN
      SELECT subject_name INTO v_subject
      FROM public.daily_timetable_slots
      WHERE id = NEW.source_timetable_slot_id
      LIMIT 1;
    END IF;

    IF v_subject IS NOT NULL THEN
      NEW.subject_name := v_subject;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_child_update_subject ON public.child_updates;
CREATE TRIGGER trg_fill_child_update_subject
  BEFORE INSERT OR UPDATE OF source_timetable_slot_id, subject_name
  ON public.child_updates
  FOR EACH ROW EXECUTE FUNCTION public.fill_child_update_subject();
