CREATE OR REPLACE FUNCTION public.notify_ptm_slots_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_branch_name text;
  v_class_name text;
  v_scope_key text;
  v_week_key text;
  v_action_url text := '/parent-ptm';
  v_date_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM 'open'
       OR OLD.status IS NOT DISTINCT FROM 'open' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
  IF NEW.class_id IS NOT NULL THEN
    SELECT class_name INTO v_class_name FROM public.classes WHERE id = NEW.class_id;
    v_scope_key := 'class-' || NEW.class_id::text;
  ELSE
    v_scope_key := 'branch-' || NEW.branch_id::text;
  END IF;

  v_week_key := to_char(NEW.slot_date, 'IYYY"W"IW');
  v_date_label := to_char(NEW.slot_date, 'DD Mon YYYY');

  FOR r IN
    SELECT DISTINCT ps.parent_id,
                    p.email,
                    COALESCE(p.first_name,'') AS parent_first,
                    s.first_name AS child_first
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE ps.status = 'approved'
      AND s.branch_id = NEW.branch_id
      AND (NEW.class_id IS NULL OR s.class_id = NEW.class_id)
  LOOP
    INSERT INTO public.notifications
      (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.parent_id,
      'PTM booking is now open',
      'New Parent–Teacher Meeting slots are available. Tap to book.',
      'ptm_slots_open',
      v_action_url,
      NEW.id,
      'ptm_slots_open_' || v_scope_key || '_' || v_week_key || '_' || r.parent_id::text,
      'normal'
    ) ON CONFLICT DO NOTHING;

    IF r.email IS NOT NULL AND r.email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'ptm-slots-open',
        r.email,
        jsonb_build_object(
          'parentName', r.parent_first,
          'childName',  r.child_first,
          'className',  v_class_name,
          'branchName', v_branch_name,
          'dateRange',  v_date_label,
          'bookingUrl', 'https://sprouts.littlegreenhearts.com/parent-ptm'
        ),
        'ptm-slots-open-' || v_scope_key || '-' || v_week_key || '-' || r.parent_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;