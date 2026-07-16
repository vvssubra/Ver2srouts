
-- PTM lifecycle hardening: email teachers on booking + correct in-app action URL.

CREATE OR REPLACE FUNCTION public.notify_ptm_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_slot RECORD;
  v_student_name text;
  v_student_first text;
  v_student_class uuid;
  v_parent_name text;
  v_parent_first text;
  v_branch_name text;
  v_msg text;
  v_title text;
  v_action_url text := '/curriculum/ptm?tab=bookings';
  v_is_reschedule boolean := false;
  v_teacher_ids uuid[] := ARRAY[]::uuid[];
  v_uid uuid;
  v_teacher_email text;
  v_teacher_first text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_is_reschedule := (NEW.previous_slot_id IS NOT NULL
                        AND NEW.previous_slot_id IS DISTINCT FROM OLD.previous_slot_id);
    IF NOT v_is_reschedule THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;

  SELECT first_name || ' ' || COALESCE(last_name, ''), first_name, class_id
    INTO v_student_name, v_student_first, v_student_class
  FROM public.students WHERE id = NEW.student_id;

  SELECT COALESCE(first_name || ' ' || COALESCE(last_name, ''), 'A parent'),
         COALESCE(first_name, '')
    INTO v_parent_name, v_parent_first
  FROM public.profiles WHERE id = NEW.parent_id;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;

  v_title := CASE WHEN v_is_reschedule THEN 'PTM rescheduled' ELSE 'New PTM booking request' END;
  v_msg := v_parent_name
           || CASE WHEN v_is_reschedule THEN ' rescheduled a PTM for ' ELSE ' requested a PTM for ' END
           || COALESCE(v_student_name, 'a student')
           || ' on ' || to_char(v_slot.slot_date, 'DD Mon YYYY')
           || ' at ' || to_char(v_slot.start_time, 'HH24:MI');

  -- Build teacher recipient list: slot.teacher_id ∪ class teachers in same branch.
  IF v_slot.teacher_id IS NOT NULL THEN
    v_teacher_ids := array_append(v_teacher_ids, v_slot.teacher_id);
  END IF;

  FOR v_uid IN
    SELECT DISTINCT bm.user_id
    FROM public.branch_memberships bm
    JOIN public.user_roles ur ON ur.user_id = bm.user_id
    WHERE bm.branch_id = NEW.branch_id
      AND ur.role = 'teacher'
      AND (
        v_student_class IS NULL
        OR COALESCE(bm.assigned_class_ids, '{}') = '{}'
        OR v_student_class = ANY(bm.assigned_class_ids)
      )
  LOOP
    v_teacher_ids := array_append(v_teacher_ids, v_uid);
  END LOOP;

  -- Notify teachers in-app + email
  FOR v_uid IN SELECT DISTINCT unnest(v_teacher_ids) LOOP
    IF v_uid IS NULL OR v_uid = NEW.parent_id THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (v_uid, v_title, v_msg, 'ptm_booking_request', v_action_url, NEW.id,
            'ptm_book_' || NEW.id::text || '_' || v_uid::text, 'high')
    ON CONFLICT DO NOTHING;

    SELECT email, COALESCE(first_name,'') INTO v_teacher_email, v_teacher_first
    FROM public.profiles WHERE id = v_uid;

    IF v_teacher_email IS NOT NULL AND v_teacher_email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'parent-ptm-booking-request',
        v_teacher_email,
        jsonb_build_object(
          'teacherName', v_teacher_first,
          'parentName', v_parent_name,
          'childName', v_student_first,
          'branchName', v_branch_name,
          'meetingDate', to_char(v_slot.slot_date, 'Dy, DD Mon YYYY'),
          'meetingTime', to_char(v_slot.start_time, 'HH12:MI AM'),
          'location', COALESCE(v_slot.location, ''),
          'parentNotes', COALESCE(NEW.parent_notes, ''),
          'isReschedule', v_is_reschedule
        ),
        'ptm-booking-req-' || NEW.id::text || '-' || v_uid::text
                          || CASE WHEN v_is_reschedule THEN '-r' ELSE '' END
      );
    END IF;
  END LOOP;

  -- Notify branch approvers (admins/franchisees) in-app only.
  PERFORM public.notify_approvers(
    _branch_id := NEW.branch_id,
    _exclude_user_id := COALESCE(v_slot.teacher_id, NEW.parent_id),
    _title := v_title,
    _message := v_msg,
    _type := 'ptm_booking_request',
    _action_url := v_action_url,
    _reference_id := NEW.id,
    _group_key := 'ptm_book_admin_' || NEW.id::text,
    _priority := 'normal'
  );

  RETURN NEW;
END;
$function$;

-- Backfill: ensure existing pending bookings have notifications + emails.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.id, b.slot_id, b.student_id, b.parent_id, b.branch_id, b.parent_notes,
           s.teacher_id, s.slot_date, s.start_time, s.location,
           st.first_name AS student_first, st.last_name AS student_last, st.class_id AS student_class,
           p.first_name AS parent_first, p.last_name AS parent_last,
           br.name AS branch_name
    FROM public.ptm_bookings b
    JOIN public.ptm_slots s ON s.id = b.slot_id
    JOIN public.students st ON st.id = b.student_id
    JOIN public.profiles p ON p.id = b.parent_id
    LEFT JOIN public.branches br ON br.id = b.branch_id
    WHERE b.status = 'pending'
  LOOP
    -- Insert (idempotent) in-app notification for slot teacher
    IF r.teacher_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
      VALUES (
        r.teacher_id,
        'New PTM booking request',
        COALESCE(r.parent_first,'A parent') || ' requested a PTM for ' || r.student_first
          || ' on ' || to_char(r.slot_date, 'DD Mon YYYY')
          || ' at ' || to_char(r.start_time, 'HH24:MI'),
        'ptm_booking_request',
        '/curriculum/ptm?tab=bookings',
        r.id,
        'ptm_book_backfill_' || r.id::text || '_' || r.teacher_id::text,
        'high'
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
