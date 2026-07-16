CREATE OR REPLACE FUNCTION public.notify_leave_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _email text;
  _name text;
  _company text;
  _note text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  SELECT p.email, COALESCE(p.first_name,''), b.name
    INTO _email, _name, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  IF _email IS NULL OR _email = '' THEN RETURN NEW; END IF;

  _note := COALESCE(NEW.level2_notes, NEW.level1_notes, NEW.review_notes, '');

  PERFORM public.dispatch_transactional_email(
    'leave-status',
    _email,
    jsonb_build_object(
      'staffName', _name,
      'status', NEW.status,
      'leaveType', COALESCE(NEW.leave_type::text, ''),
      'startDate', to_char(NEW.start_date, 'DD Mon YYYY'),
      'endDate', to_char(NEW.end_date, 'DD Mon YYYY'),
      'days', to_char(COALESCE(NEW.days,0), 'FM990.0'),
      'approverNote', _note,
      'companyName', _company
    ),
    'leave-status-' || NEW.id::text || '-' || NEW.status
  );
  RETURN NEW;
END;
$function$;