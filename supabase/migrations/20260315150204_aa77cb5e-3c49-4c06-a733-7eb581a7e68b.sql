CREATE OR REPLACE FUNCTION public.notify_new_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _invitation record;
  _student_name text;
BEGIN
  -- Check if this user was invited via school-initiated parent invitation
  SELECT pi.student_id INTO _invitation
  FROM public.parent_invitations pi
  WHERE pi.email = NEW.email
    AND pi.status = 'pending'
  LIMIT 1;

  IF _invitation IS NOT NULL THEN
    -- Get student name for the notification
    SELECT s.first_name || ' ' || s.last_name INTO _student_name
    FROM public.students s
    WHERE s.id = _invitation.student_id;

    INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
    SELECT ur.user_id,
      'Parent Joined via Invitation',
      'Parent (' || NEW.email || ') has joined via school invitation and has been linked to ' || COALESCE(_student_name, 'their child') || '.',
      'user_registration',
      NEW.id,
      '/students/' || _invitation.student_id
    FROM public.user_roles ur WHERE ur.role = 'super_admin';
  ELSE
    -- Default: generic new user registration notification
    INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
    SELECT ur.user_id, 'New User Registration',
      'A new user (' || NEW.email || ') has registered and needs a role assignment.',
      'user_registration', NEW.id, '/users'
    FROM public.user_roles ur WHERE ur.role = 'super_admin';
  END IF;

  RETURN NEW;
END;
$function$;