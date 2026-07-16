
-- Batch 6F-B-4: Teacher notification scoping for moment engagement + PTM booking.
-- Removes the "teacher with no assigned classes = receives everything" fallback
-- and requires assigned_class_ids to actually overlap the affected child's class.

CREATE OR REPLACE FUNCTION public.notify_moment_author_on_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_update RECORD;
  v_actor_id uuid;
  v_actor_role app_role;
  v_actor_name text;
  v_student_name text;
  v_kind text := TG_ARGV[0];
  v_action_label text;
  v_title text;
  v_msg_staff text;
  v_msg_parent text;
  v_student_ids uuid[];
  v_class_ids uuid[];
  v_recipient uuid;
  v_recipients uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_kind = 'comment' THEN
    v_actor_id := (to_jsonb(NEW) ->> 'author_id')::uuid;
  ELSE
    v_actor_id := (to_jsonb(NEW) ->> 'user_id')::uuid;
  END IF;

  SELECT cu.id, cu.created_by, cu.branch_id, cu.student_id, cu.visible_to_parent,
         s.first_name AS student_first
    INTO v_update
  FROM public.child_updates cu
  LEFT JOIN public.students s ON s.id = cu.student_id
  WHERE cu.id = NEW.update_id;

  IF v_update.id IS NULL THEN RETURN NEW; END IF;

  SELECT role INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor_id LIMIT 1;
  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), 'Someone')
    INTO v_actor_name
  FROM public.profiles WHERE id = v_actor_id;

  v_action_label := CASE WHEN v_kind = 'comment' THEN 'commented on' ELSE 'reacted to' END;

  v_student_ids := ARRAY(
    SELECT DISTINCT sid FROM (
      SELECT v_update.student_id AS sid WHERE v_update.student_id IS NOT NULL
      UNION
      SELECT cus.student_id FROM public.child_update_students cus WHERE cus.update_id = v_update.id
    ) x WHERE sid IS NOT NULL
  );

  v_student_name := COALESCE(v_update.student_first, (
    SELECT first_name FROM public.students WHERE id = ANY(v_student_ids) LIMIT 1
  ), 'a child');

  v_msg_staff  := v_actor_name || ' ' || v_action_label || ' the moment for ' || v_student_name || '.';
  v_msg_parent := v_actor_name || ' ' || v_action_label || ' ' || v_student_name || '''s moment.';

  IF v_update.created_by IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_update.created_by);
  END IF;

  v_class_ids := ARRAY(
    SELECT DISTINCT class_id FROM public.students
    WHERE id = ANY(v_student_ids) AND class_id IS NOT NULL
  );

  -- Teachers: require an actual overlap with the moment's class(es).
  -- Removed the previous "no assigned classes = notify all teachers" fallback.
  IF array_length(v_class_ids, 1) > 0 THEN
    FOR v_recipient IN
      SELECT DISTINCT bm.user_id
      FROM public.branch_memberships bm
      JOIN public.user_roles ur ON ur.user_id = bm.user_id
      WHERE bm.branch_id = v_update.branch_id
        AND ur.role = 'teacher'
        AND bm.assigned_class_ids IS NOT NULL
        AND bm.assigned_class_ids && v_class_ids
    LOOP
      v_recipients := array_append(v_recipients, v_recipient);
    END LOOP;
  END IF;

  -- Branch admins / franchisees still receive engagement
  FOR v_recipient IN
    SELECT DISTINCT bm.user_id
    FROM public.branch_memberships bm
    JOIN public.user_roles ur ON ur.user_id = bm.user_id
    WHERE bm.branch_id = v_update.branch_id
      AND ur.role IN ('admin', 'franchisee')
  LOOP
    v_recipients := array_append(v_recipients, v_recipient);
  END LOOP;

  -- Linked parents
  FOR v_recipient IN
    SELECT DISTINCT ps.parent_id
    FROM public.parent_students ps
    WHERE ps.student_id = ANY(v_student_ids) AND ps.status = 'approved'
  LOOP
    v_recipients := array_append(v_recipients, v_recipient);
  END LOOP;

  -- Reply fan-out for comments
  IF v_kind = 'comment' THEN
    FOR v_recipient IN
      SELECT DISTINCT mc.author_id
      FROM public.moment_comments mc
      WHERE mc.update_id = v_update.id AND mc.author_id IS NOT NULL
    LOOP
      v_recipients := array_append(v_recipients, v_recipient);
    END LOOP;
  END IF;

  FOR v_recipient IN
    SELECT DISTINCT unnest(v_recipients) AS rid
  LOOP
    IF v_recipient IS NULL OR v_recipient = v_actor_id THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = v_recipient AND role = 'parent'
    ) THEN
      v_title := CASE WHEN v_kind = 'comment' THEN 'New comment on a moment' ELSE 'New reaction on a moment' END;
      INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
      VALUES (
        v_recipient, v_title, v_msg_parent,
        'moment_engagement',
        '/journey?moment=' || v_update.id::text,
        v_update.id,
        'moment_eng_' || v_update.id::text || '_' || v_kind || '_' || v_recipient::text,
        'normal'
      )
      ON CONFLICT DO NOTHING;
    ELSE
      v_title := CASE WHEN v_kind = 'comment' THEN 'Parent commented on a moment' ELSE 'Parent reacted to a moment' END;
      INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
      VALUES (
        v_recipient, v_title, v_msg_staff,
        'moment_engagement',
        '/moments?update=' || v_update.id::text,
        v_update.id,
        'moment_eng_' || v_update.id::text || '_' || v_kind || '_' || v_recipient::text,
        'normal'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;


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

  -- Always include the slot's assigned teacher
  IF v_slot.teacher_id IS NOT NULL THEN
    v_teacher_ids := array_append(v_teacher_ids, v_slot.teacher_id);
  END IF;

  -- Class teachers: require assigned_class_ids to actually contain the child's class.
  -- Removed the previous "unassigned teacher = notify" fallback.
  IF v_student_class IS NOT NULL THEN
    FOR v_uid IN
      SELECT DISTINCT bm.user_id
      FROM public.branch_memberships bm
      JOIN public.user_roles ur ON ur.user_id = bm.user_id
      WHERE bm.branch_id = NEW.branch_id
        AND ur.role = 'teacher'
        AND bm.assigned_class_ids IS NOT NULL
        AND v_student_class = ANY(bm.assigned_class_ids)
    LOOP
      v_teacher_ids := array_append(v_teacher_ids, v_uid);
    END LOOP;
  END IF;

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
