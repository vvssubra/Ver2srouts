
-- Extend approval-pending email helper to accept an inbox URL override.
CREATE OR REPLACE FUNCTION public.notify_approval_pending_email(
  _branch_id uuid, _exclude_user_id uuid, _requester_name text, _request_type text,
  _summary text, _details jsonb, _company_name text, _ref_id uuid, _idem_prefix text,
  _inbox_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _approvers uuid[];
  _uid uuid;
  _email text;
  _name text;
  _payload jsonb;
BEGIN
  _approvers := public.get_branch_approver_ids(_branch_id);
  FOREACH _uid IN ARRAY _approvers LOOP
    IF _uid IS DISTINCT FROM _exclude_user_id THEN
      SELECT email, COALESCE(first_name,'')
        INTO _email, _name
      FROM public.profiles WHERE id = _uid;
      IF _email IS NOT NULL AND _email <> '' THEN
        _payload := jsonb_build_object(
          'approverName', _name,
          'requesterName', _requester_name,
          'requestType', _request_type,
          'summary', _summary,
          'details', _details,
          'companyName', _company_name
        );
        IF _inbox_url IS NOT NULL AND _inbox_url <> '' THEN
          _payload := _payload || jsonb_build_object('inboxUrl', _inbox_url);
        END IF;
        PERFORM public.dispatch_transactional_email(
          'approval-pending',
          _email,
          _payload,
          _idem_prefix || '-' || _ref_id::text || '-' || _uid::text
        );
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- Fix leave trigger: use /leave and pass inbox URL to email.
CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _requester text;
  _company text;
  _app_url text;
BEGIN
  IF NEW.status <> 'pending'::public.leave_status THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  _app_url := 'https://sprouts.littlegreenhearts.com';

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Leave request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' requested ' || to_char(COALESCE(NEW.days,0),'FM990.0') || ' day(s) of ' || COALESCE(NEW.leave_type::text,'leave') || ' from ' || to_char(NEW.start_date,'DD Mon'),
    'leave_pending', '/leave', NEW.id,
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
    _company, NEW.id, 'leave-pending',
    _app_url || '/leave'
  );
  RETURN NEW;
END;
$$;

-- Fix overtime trigger.
CREATE OR REPLACE FUNCTION public.notify_ot_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requester text;
  _company text;
  _app_url text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  _app_url := 'https://sprouts.littlegreenhearts.com';

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Overtime request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted ' || to_char(COALESCE(NEW.hours,0),'FM990.0') || 'h OT on ' || to_char(NEW.date,'DD Mon YYYY'),
    'ot_pending', '/overtime', NEW.id,
    'ot_pending_' || NEW.id::text, 'normal'
  );

  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id,
    trim(_requester),
    'Overtime',
    to_char(COALESCE(NEW.hours,0),'FM990.0') || 'h on ' || to_char(NEW.date,'DD Mon YYYY'),
    jsonb_build_array(
      jsonb_build_object('label','Date','value', to_char(NEW.date,'DD Mon YYYY')),
      jsonb_build_object('label','Hours','value', to_char(COALESCE(NEW.hours,0),'FM990.0') || ' h'),
      jsonb_build_object('label','Reason','value', COALESCE(NEW.reason,''))
    ),
    _company, NEW.id, 'ot-pending',
    _app_url || '/overtime'
  );
  RETURN NEW;
END;
$$;

-- Fix claim trigger.
CREATE OR REPLACE FUNCTION public.notify_claim_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requester text;
  _company text;
  _app_url text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  _app_url := 'https://sprouts.littlegreenhearts.com';

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Claim awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted a ' || COALESCE(initcap(NEW.claim_type),'general') || ' claim of RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00'),
    'claim_pending', '/claims', NEW.id,
    'claim_pending_' || NEW.id::text, 'normal'
  );

  PERFORM public.notify_approval_pending_email(
    NEW.branch_id, NEW.user_id,
    trim(_requester),
    'Claim',
    'RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00') || ' — ' || COALESCE(initcap(NEW.claim_type),''),
    jsonb_build_array(
      jsonb_build_object('label','Type','value', COALESCE(initcap(NEW.claim_type),'')),
      jsonb_build_object('label','Amount','value', 'RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00')),
      jsonb_build_object('label','Description','value', COALESCE(NEW.description,''))
    ),
    _company, NEW.id, 'claim-pending',
    _app_url || '/claims'
  );
  RETURN NEW;
END;
$$;

-- Backfill: rewrite existing pending notifications that still point at /hr/* so users can tap them.
UPDATE public.notifications SET action_url = '/leave'    WHERE action_url = '/hr/leave';
UPDATE public.notifications SET action_url = '/overtime' WHERE action_url = '/hr/overtime';
UPDATE public.notifications SET action_url = '/claims'   WHERE action_url = '/hr/claims';
