
CREATE OR REPLACE FUNCTION public.notify_probation_expiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _staff_name text;
  _manager_id uuid;
BEGIN
  IF NEW.probation_status = 'ongoing' AND NEW.probation_end_date IS NOT NULL 
     AND NEW.probation_end_date <= (CURRENT_DATE + INTERVAL '14 days') THEN
    
    SELECT first_name || ' ' || last_name INTO _staff_name
    FROM public.profiles WHERE id = NEW.user_id;

    _manager_id := NEW.reports_to;
    IF _manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
      VALUES (_manager_id, 'Probation Ending Soon',
        COALESCE(_staff_name, 'A staff member') || '''s probation ends on ' || NEW.probation_end_date::text || '. Please review and confirm or extend.',
        'probation_reminder', NEW.user_id, '/staff-management/' || NEW.user_id::text)
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
    SELECT ur.user_id, 'Probation Ending Soon',
      COALESCE(_staff_name, 'A staff member') || '''s probation ends on ' || NEW.probation_end_date::text || '.',
      'probation_reminder', NEW.user_id, '/staff-management/' || NEW.user_id::text
    FROM public.user_roles ur WHERE ur.role = 'super_admin';
  END IF;

  RETURN NEW;
END;
$function$;
