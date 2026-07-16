CREATE OR REPLACE FUNCTION public.enforce_ptm_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot public.ptm_slots%ROWTYPE;
  v_active_count integer;
  v_target_slot_id uuid;
BEGIN
  v_target_slot_id := COALESCE(NEW.slot_id, OLD.slot_id);

  SELECT * INTO v_slot
  FROM public.ptm_slots
  WHERE id = v_target_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status IN ('pending', 'confirmed') THEN
    IF v_slot.status = 'cancelled' THEN
      RAISE EXCEPTION 'This PTM slot is no longer available.';
    END IF;

    SELECT count(*) INTO v_active_count
    FROM public.ptm_bookings
    WHERE slot_id = NEW.slot_id
      AND status IN ('pending', 'confirmed')
      AND id IS DISTINCT FROM NEW.id;

    IF v_active_count >= COALESCE(v_slot.capacity, 1) THEN
      RAISE EXCEPTION 'This PTM slot has already been booked.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_ptm_slot_status_from_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_id uuid;
  v_capacity integer;
  v_active_count integer;
  v_current_status text;
BEGIN
  FOR v_slot_id IN
    SELECT DISTINCT slot_id
    FROM (
      SELECT NEW.slot_id WHERE TG_OP IN ('INSERT', 'UPDATE') AND NEW.slot_id IS NOT NULL
      UNION ALL
      SELECT OLD.slot_id WHERE TG_OP IN ('UPDATE', 'DELETE') AND OLD.slot_id IS NOT NULL
    ) ids
  LOOP
    SELECT capacity, status INTO v_capacity, v_current_status
    FROM public.ptm_slots
    WHERE id = v_slot_id;

    IF NOT FOUND OR v_current_status = 'cancelled' THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_active_count
    FROM public.ptm_bookings
    WHERE slot_id = v_slot_id
      AND status IN ('pending', 'confirmed');

    IF v_active_count >= COALESCE(v_capacity, 1) THEN
      UPDATE public.ptm_slots
      SET status = 'closed', updated_at = now()
      WHERE id = v_slot_id AND status = 'open';
    ELSIF v_active_count < COALESCE(v_capacity, 1) THEN
      UPDATE public.ptm_slots
      SET status = 'open', updated_at = now()
      WHERE id = v_slot_id AND status = 'closed';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ptm_slot_capacity ON public.ptm_bookings;
CREATE TRIGGER trg_enforce_ptm_slot_capacity
BEFORE INSERT OR UPDATE OF slot_id, status ON public.ptm_bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_ptm_slot_capacity();

DROP TRIGGER IF EXISTS trg_sync_ptm_slot_status_from_bookings ON public.ptm_bookings;
CREATE TRIGGER trg_sync_ptm_slot_status_from_bookings
AFTER INSERT OR UPDATE OF slot_id, status OR DELETE ON public.ptm_bookings
FOR EACH ROW EXECUTE FUNCTION public.sync_ptm_slot_status_from_bookings();

UPDATE public.ptm_slots s
SET status = 'closed', updated_at = now()
WHERE status = 'open'
  AND (
    SELECT count(*)
    FROM public.ptm_bookings b
    WHERE b.slot_id = s.id
      AND b.status IN ('pending', 'confirmed')
  ) >= COALESCE(s.capacity, 1);

UPDATE public.ptm_slots s
SET status = 'open', updated_at = now()
WHERE status = 'closed'
  AND (
    SELECT count(*)
    FROM public.ptm_bookings b
    WHERE b.slot_id = s.id
      AND b.status IN ('pending', 'confirmed')
  ) < COALESCE(s.capacity, 1);