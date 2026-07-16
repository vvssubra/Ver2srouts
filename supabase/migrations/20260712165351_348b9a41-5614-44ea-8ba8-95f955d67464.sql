CREATE OR REPLACE FUNCTION public.notify_announcement_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  _branch_name text;
  _target text := NEW.target_type;
  _is_staff boolean := _target IN ('staff','staff_all','staff_specific');
  _action_url text;
BEGIN
  -- Never broadcast when the audience is not explicitly set. Legacy rows
  -- with a NULL target_type must NOT fan out to every parent in the branch.
  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip staff-only fanout here (staff notifications handled separately).
  IF _is_staff THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _branch_name FROM public.branches WHERE id = NEW.branch_id;
  _action_url := '/parent-messages';

  FOR r IN
    SELECT DISTINCT p.id AS parent_id, p.email, COALESCE(p.first_name,'') AS name
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE s.branch_id = NEW.branch_id
      AND s.is_active = true
      AND ps.status = 'approved'
      AND (
        _target IN ('all','parents_all','parents')
        OR (_target IN ('class','parents_class') AND s.class_name = NEW.target_class)
        OR (_target IN ('specific','parents_specific') AND p.id = ANY(COALESCE(NEW.target_parent_ids, ARRAY[]::uuid[])))
      )
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.parent_id,
      '📢 ' || NEW.title,
      left(COALESCE(NEW.body,''), 240),
      'announcement',
      _action_url,
      NEW.id,
      'announce_' || NEW.id::text || '_' || r.parent_id::text,
      'normal'
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$function$;