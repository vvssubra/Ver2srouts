-- Replace moment engagement trigger function with role-aware fan-out
-- Notifies: Moment author, class teachers (via student class assignment),
-- branch admins, and other linked parents. Skips self.
CREATE OR REPLACE FUNCTION public.notify_moment_author_on_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update RECORD;
  v_actor_id uuid;
  v_actor_role app_role;
  v_actor_name text;
  v_student_name text;
  v_kind text := TG_ARGV[0]; -- 'comment' or 'reaction'
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

  -- Resolve every student associated with the moment
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

  v_msg_staff := v_actor_name || ' ' || v_action_label || ' the moment for ' || v_student_name || '.';
  v_msg_parent := v_actor_name || ' ' || v_action_label || ' ' || v_student_name || '''s moment.';

  -- Always notify the moment author (teacher who created it)
  IF v_update.created_by IS NOT NULL THEN
    v_recipients := array_append(v_recipients, v_update.created_by);
  END IF;

  -- Class teachers + branch admins for staff fan-out
  v_class_ids := ARRAY(
    SELECT DISTINCT class_id FROM public.students
    WHERE id = ANY(v_student_ids) AND class_id IS NOT NULL
  );

  -- Teachers assigned to any of those classes (or with no class scope)
  FOR v_recipient IN
    SELECT DISTINCT bm.user_id
    FROM public.branch_memberships bm
    JOIN public.user_roles ur ON ur.user_id = bm.user_id
    WHERE bm.branch_id = v_update.branch_id
      AND ur.role = 'teacher'
      AND (
        COALESCE(bm.assigned_class_ids, '{}') = '{}'
        OR bm.assigned_class_ids && v_class_ids
      )
  LOOP
    v_recipients := array_append(v_recipients, v_recipient);
  END LOOP;

  -- Branch admins / franchisees
  FOR v_recipient IN
    SELECT DISTINCT bm.user_id
    FROM public.branch_memberships bm
    JOIN public.user_roles ur ON ur.user_id = bm.user_id
    WHERE bm.branch_id = v_update.branch_id
      AND ur.role IN ('admin', 'franchisee')
  LOOP
    v_recipients := array_append(v_recipients, v_recipient);
  END LOOP;

  -- All linked parents (so other parents of the same child see engagement too)
  FOR v_recipient IN
    SELECT DISTINCT ps.parent_id
    FROM public.parent_students ps
    WHERE ps.student_id = ANY(v_student_ids) AND ps.status = 'approved'
  LOOP
    v_recipients := array_append(v_recipients, v_recipient);
  END LOOP;

  -- Reply fan-out for comments: notify prior commenters too
  IF v_kind = 'comment' THEN
    FOR v_recipient IN
      SELECT DISTINCT mc.author_id
      FROM public.moment_comments mc
      WHERE mc.update_id = v_update.id AND mc.author_id IS NOT NULL
    LOOP
      v_recipients := array_append(v_recipients, v_recipient);
    END LOOP;
  END IF;

  -- Dedupe + insert one notification per unique recipient (skip actor)
  FOR v_recipient IN
    SELECT DISTINCT unnest(v_recipients) AS rid
  LOOP
    IF v_recipient IS NULL OR v_recipient = v_actor_id THEN CONTINUE; END IF;

    -- Determine if recipient is a parent (use parent-friendly link & wording)
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
$$;