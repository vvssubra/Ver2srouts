CREATE OR REPLACE FUNCTION public.notify_new_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_id)
  SELECT ur.user_id, 'New User Registration',
    'A new user (' || NEW.email || ') has registered and needs a role assignment.',
    'user_registration', NEW.id
  FROM public.user_roles ur WHERE ur.role = 'super_admin';
  RETURN NEW;
END;
$function$;