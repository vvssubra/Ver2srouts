-- 1. Schema additions for reschedule tracking
ALTER TABLE public.ptm_bookings
  ADD COLUMN IF NOT EXISTS previous_slot_id uuid REFERENCES public.ptm_slots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;

-- 2. Update the existing sync trigger to also UPDATE meeting on reschedule
CREATE OR REPLACE FUNCTION public.sync_ptm_booking_to_meeting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_meeting_id UUID;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') THEN
    SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;

    IF NEW.ptm_meeting_id IS NOT NULL THEN
      -- Reschedule: update existing meeting
      UPDATE public.ptm_meetings
        SET meeting_date = v_slot.slot_date,
            meeting_time = v_slot.start_time,
            teacher_id   = v_slot.teacher_id,
            class_id     = v_slot.class_id,
            status       = 'scheduled',
            updated_at   = now()
        WHERE id = NEW.ptm_meeting_id;
    ELSE
      INSERT INTO public.ptm_meetings (
        student_id, class_id, branch_id, meeting_date, meeting_time,
        teacher_id, status
      ) VALUES (
        NEW.student_id, v_slot.class_id, NEW.branch_id, v_slot.slot_date, v_slot.start_time,
        v_slot.teacher_id, 'scheduled'
      ) RETURNING id INTO v_meeting_id;
      NEW.ptm_meeting_id := v_meeting_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Notify parents when a PTM slot is published
CREATE OR REPLACE FUNCTION public.notify_ptm_slot_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_name text;
  v_action_url text := '/parent-ptm';
  v_msg text;
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    SELECT class_name INTO v_class_name FROM public.classes WHERE id = NEW.class_id;
  END IF;

  v_msg := 'New PTM slot available on ' || to_char(NEW.slot_date, 'DD Mon YYYY')
           || ' at ' || to_char(NEW.start_time, 'HH24:MI')
           || COALESCE(' for ' || v_class_name, '');

  INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
  SELECT DISTINCT ps.parent_id,
         'PTM slots available',
         v_msg,
         'ptm_slot_published',
         v_action_url,
         NEW.id,
         'ptm_slot_' || NEW.id::text,
         'normal'
  FROM public.parent_students ps
  JOIN public.students s ON s.id = ps.student_id
  WHERE ps.status = 'approved'
    AND s.branch_id = NEW.branch_id
    AND s.is_active = true
    AND (NEW.class_id IS NULL OR s.class_id = NEW.class_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ptm_slot_published ON public.ptm_slots;
CREATE TRIGGER trg_notify_ptm_slot_published
AFTER INSERT ON public.ptm_slots
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_slot_published();

-- 4. Notify teacher + admins when parent books / reschedules
CREATE OR REPLACE FUNCTION public.notify_ptm_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_student_name text;
  v_parent_name text;
  v_msg text;
  v_is_reschedule boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_is_reschedule := (NEW.previous_slot_id IS NOT NULL
                        AND NEW.previous_slot_id IS DISTINCT FROM OLD.previous_slot_id);
    IF NOT v_is_reschedule THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;
  SELECT first_name || ' ' || COALESCE(last_name, '') INTO v_student_name
    FROM public.students WHERE id = NEW.student_id;
  SELECT COALESCE(first_name || ' ' || COALESCE(last_name, ''), 'A parent') INTO v_parent_name
    FROM public.profiles WHERE id = NEW.parent_id;

  v_msg := v_parent_name
           || CASE WHEN v_is_reschedule THEN ' rescheduled a PTM for ' ELSE ' requested a PTM for ' END
           || COALESCE(v_student_name, 'a student')
           || ' on ' || to_char(v_slot.slot_date, 'DD Mon YYYY')
           || ' at ' || to_char(v_slot.start_time, 'HH24:MI');

  -- Notify teacher
  IF v_slot.teacher_id IS NOT NULL AND v_slot.teacher_id <> NEW.parent_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      v_slot.teacher_id,
      CASE WHEN v_is_reschedule THEN 'PTM rescheduled' ELSE 'New PTM booking request' END,
      v_msg,
      'ptm_booking_request',
      '/curriculum/ptm/slots',
      NEW.id,
      'ptm_book_' || NEW.id::text,
      'high'
    );
  END IF;

  -- Notify branch approvers
  PERFORM public.notify_approvers(
    _branch_id := NEW.branch_id,
    _exclude_user_id := COALESCE(v_slot.teacher_id, NEW.parent_id),
    _title := CASE WHEN v_is_reschedule THEN 'PTM rescheduled' ELSE 'New PTM booking request' END,
    _message := v_msg,
    _type := 'ptm_booking_request',
    _action_url := '/curriculum/ptm/slots',
    _reference_id := NEW.id,
    _group_key := 'ptm_book_admin_' || NEW.id::text,
    _priority := 'normal'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ptm_booking_insert ON public.ptm_bookings;
CREATE TRIGGER trg_notify_ptm_booking_insert
AFTER INSERT ON public.ptm_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_booking_request();

DROP TRIGGER IF EXISTS trg_notify_ptm_booking_reschedule ON public.ptm_bookings;
CREATE TRIGGER trg_notify_ptm_booking_reschedule
AFTER UPDATE ON public.ptm_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_booking_request();

-- 5. Notify parent when status changes (confirm / decline / cancel)
CREATE OR REPLACE FUNCTION public.notify_ptm_booking_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_student_name text;
  v_title text;
  v_msg text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;
  SELECT first_name || ' ' || COALESCE(last_name, '') INTO v_student_name
    FROM public.students WHERE id = NEW.student_id;

  IF NEW.status = 'confirmed' THEN
    v_title := 'PTM confirmed';
    v_msg := 'Your PTM for ' || COALESCE(v_student_name, 'your child')
             || ' on ' || to_char(v_slot.slot_date, 'DD Mon YYYY')
             || ' at ' || to_char(v_slot.start_time, 'HH24:MI') || ' is confirmed.';
  ELSIF NEW.status = 'declined' THEN
    v_title := 'PTM request declined';
    v_msg := 'Your PTM request for ' || COALESCE(v_student_name, 'your child') || ' was declined.';
  ELSIF NEW.status = 'cancelled' THEN
    -- Only notify parent if the cancel was made by someone else
    RETURN NEW;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
  VALUES (
    NEW.parent_id, v_title, v_msg, 'ptm_status_change',
    '/parent-ptm', NEW.id,
    'ptm_status_' || NEW.id::text || '_' || NEW.status,
    'high'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ptm_booking_status ON public.ptm_bookings;
CREATE TRIGGER trg_notify_ptm_booking_status
AFTER UPDATE ON public.ptm_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_booking_status_change();