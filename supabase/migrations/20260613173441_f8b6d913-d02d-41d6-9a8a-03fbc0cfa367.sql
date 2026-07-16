CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requester text;
  _company text;
BEGIN
  IF NEW.status <> 'pending'::public.leave_status THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Leave request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' requested ' || to_char(COALESCE(NEW.days,0),'FM990.0') || ' day(s) of ' || COALESCE(NEW.leave_type::text,'leave') || ' from ' || to_char(NEW.start_date,'DD Mon'),
    'leave_pending', '/hr/leave', NEW.id,
    'leave_pending_' || NEW.id::text, 'normal'
  );

  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id,
    trim(_requester),
    'Leave',
    to_char(COALESCE(NEW.days,0),'FM990.0') || ' day(s) — ' || COALESCE(NEW.leave_type::text,''),
    jsonb_build_array(
      jsonb_build_object('label','Type','value', COALESCE(NEW.leave_type::text,'')),
      jsonb_build_object('label','From','value', to_char(NEW.start_date,'DD Mon YYYY')),
      jsonb_build_object('label','To','value', to_char(NEW.end_date,'DD Mon YYYY')),
      jsonb_build_object('label','Days','value', to_char(COALESCE(NEW.days,0),'FM990.0')),
      jsonb_build_object('label','Reason','value', COALESCE(NEW.reason,''))
    ),
    _company, NEW.id, 'leave-pending'
  );
  RETURN NEW;
END;
$$;