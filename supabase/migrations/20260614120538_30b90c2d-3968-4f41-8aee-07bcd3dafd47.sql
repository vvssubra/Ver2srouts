
CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _requester text; _company text; _app_url text; _branch_qs text;
BEGIN
  IF NEW.status <> 'pending'::public.leave_status THEN RETURN NEW; END IF;
  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''), b.name
    INTO _requester, _company
  FROM public.profiles p LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;
  _app_url := 'https://sprouts.littlegreenhearts.com';
  _branch_qs := CASE WHEN NEW.branch_id IS NOT NULL THEN '?branch=' || NEW.branch_id::text ELSE '' END;
  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Leave request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' requested ' || to_char(COALESCE(NEW.days,0),'FM990.0') || ' day(s) of ' || COALESCE(NEW.leave_type::text,'leave') || ' from ' || to_char(NEW.start_date,'DD Mon'),
    'leave_pending', '/leave' || _branch_qs, NEW.id,
    'leave_pending_' || NEW.id::text, 'normal'
  );
  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id, trim(_requester), 'Leave',
    to_char(COALESCE(NEW.days,0),'FM990.0') || ' day(s) — ' || COALESCE(NEW.leave_type::text,''),
    jsonb_build_array(
      jsonb_build_object('label','Type','value', COALESCE(NEW.leave_type::text,'')),
      jsonb_build_object('label','From','value', to_char(NEW.start_date,'DD Mon YYYY')),
      jsonb_build_object('label','To','value', to_char(NEW.end_date,'DD Mon YYYY')),
      jsonb_build_object('label','Days','value', to_char(COALESCE(NEW.days,0),'FM990.0')),
      jsonb_build_object('label','Reason','value', COALESCE(NEW.reason,''))
    ),
    _company, NEW.id, 'leave-pending', _app_url || '/leave' || _branch_qs
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_ot_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _requester text; _company text; _app_url text; _branch_qs text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;
  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''), b.name
    INTO _requester, _company
  FROM public.profiles p LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;
  _app_url := 'https://sprouts.littlegreenhearts.com';
  _branch_qs := CASE WHEN NEW.branch_id IS NOT NULL THEN '?branch=' || NEW.branch_id::text ELSE '' END;
  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Overtime request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted ' || to_char(COALESCE(NEW.hours,0),'FM990.0') || 'h OT on ' || to_char(NEW.date,'DD Mon YYYY'),
    'ot_pending', '/overtime' || _branch_qs, NEW.id,
    'ot_pending_' || NEW.id::text, 'normal'
  );
  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id, trim(_requester), 'Overtime',
    to_char(COALESCE(NEW.hours,0),'FM990.0') || 'h on ' || to_char(NEW.date,'DD Mon YYYY'),
    jsonb_build_array(
      jsonb_build_object('label','Date','value', to_char(NEW.date,'DD Mon YYYY')),
      jsonb_build_object('label','Hours','value', to_char(COALESCE(NEW.hours,0),'FM990.0') || ' h'),
      jsonb_build_object('label','Reason','value', COALESCE(NEW.reason,''))
    ),
    _company, NEW.id, 'ot-pending', _app_url || '/overtime' || _branch_qs
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_claim_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _requester text; _company text; _app_url text; _branch_qs text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;
  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''), b.name
    INTO _requester, _company
  FROM public.profiles p LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;
  _app_url := 'https://sprouts.littlegreenhearts.com';
  _branch_qs := CASE WHEN NEW.branch_id IS NOT NULL THEN '?branch=' || NEW.branch_id::text ELSE '' END;
  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Claim awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted a ' || COALESCE(initcap(NEW.claim_type),'general') || ' claim of RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00'),
    'claim_pending', '/claims' || _branch_qs, NEW.id,
    'claim_pending_' || NEW.id::text, 'normal'
  );
  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id, trim(_requester), 'Claim',
    'RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00') || ' — ' || COALESCE(initcap(NEW.claim_type),''),
    jsonb_build_array(
      jsonb_build_object('label','Type','value', COALESCE(initcap(NEW.claim_type),'')),
      jsonb_build_object('label','Amount','value', 'RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00')),
      jsonb_build_object('label','Description','value', COALESCE(NEW.description,''))
    ),
    _company, NEW.id, 'claim-pending', _app_url || '/claims' || _branch_qs
  );
  RETURN NEW;
END;
$function$;

-- Backfill existing pending notifications with branch query
UPDATE public.notifications n
SET action_url = '/leave?branch=' || lr.branch_id::text
FROM public.leave_requests lr
WHERE n.reference_id = lr.id
  AND n.type = 'leave_pending'
  AND lr.branch_id IS NOT NULL
  AND COALESCE(n.action_url,'') NOT LIKE '%branch=%';

UPDATE public.notifications n
SET action_url = '/overtime?branch=' || o.branch_id::text
FROM public.overtime_requests o
WHERE n.reference_id = o.id
  AND n.type = 'ot_pending'
  AND o.branch_id IS NOT NULL
  AND COALESCE(n.action_url,'') NOT LIKE '%branch=%';

UPDATE public.notifications n
SET action_url = '/claims?branch=' || c.branch_id::text
FROM public.staff_claims c
WHERE n.reference_id = c.id
  AND n.type = 'claim_pending'
  AND c.branch_id IS NOT NULL
  AND COALESCE(n.action_url,'') NOT LIKE '%branch=%';
