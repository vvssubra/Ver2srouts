CREATE OR REPLACE FUNCTION public.notify_moment_author_on_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_update RECORD;
  v_student_name text;
  v_actor_role app_role;
  v_message text;
  v_kind text := TG_ARGV[0];
  v_actor_id uuid;
BEGIN
  -- Avoid referencing fields that don't exist on the triggering table
  IF v_kind = 'comment' THEN
    v_actor_id := (to_jsonb(NEW) ->> 'author_id')::uuid;
  ELSE
    v_actor_id := (to_jsonb(NEW) ->> 'user_id')::uuid;
  END IF;

  SELECT cu.*, s.first_name, s.last_name
    INTO v_update
  FROM public.child_updates cu
  LEFT JOIN public.students s ON s.id = cu.student_id
  WHERE cu.id = NEW.update_id;

  IF v_update.id IS NULL THEN RETURN NEW; END IF;

  SELECT role INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor_id LIMIT 1;
  IF v_actor_role IS DISTINCT FROM 'parent' THEN RETURN NEW; END IF;

  v_student_name := COALESCE(v_update.first_name, 'a child');
  v_message := CASE WHEN v_kind = 'comment'
                    THEN 'A parent commented on your update for ' || v_student_name
                    ELSE 'A parent reacted to your update for ' || v_student_name END;

  IF v_update.created_by IS NOT NULL AND v_update.created_by <> v_actor_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      v_update.created_by,
      'New parent ' || v_kind,
      v_message,
      'moment_engagement',
      '/moments?update=' || v_update.id::text,
      v_update.id,
      'moment_eng_' || v_update.id::text || '_' || v_kind,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$function$;