
-- Drop the old 4-arg version; recreate with optional preference args
DROP FUNCTION IF EXISTS public.dispatch_transactional_email(text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.dispatch_transactional_email(
  _template_name   text,
  _recipient_email text,
  _template_data   jsonb,
  _idempotency_key text,
  _user_id         uuid DEFAULT NULL,
  _category        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-transactional-email';
  _email_allowed boolean;
BEGIN
  IF _recipient_email IS NULL OR _recipient_email = '' THEN
    RETURN;
  END IF;

  -- Preference gate: only when both user_id + category are supplied
  IF _user_id IS NOT NULL AND _category IS NOT NULL THEN
    SELECT email INTO _email_allowed
      FROM public.notification_preferences
     WHERE user_id = _user_id AND category = _category
     LIMIT 1;
    -- Default = opt-in if no row exists
    IF _email_allowed IS NOT NULL AND _email_allowed = false THEN
      RAISE LOG 'dispatch_transactional_email skipped: user % opted out of % email', _user_id, _category;
      RETURN;
    END IF;
  END IF;

  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF _service_key IS NULL THEN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  END IF;

  IF _service_key IS NULL THEN
    RAISE LOG 'dispatch_transactional_email: no service key in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'templateName',   _template_name,
      'recipientEmail', _recipient_email,
      'idempotencyKey', _idempotency_key,
      'templateData',   _template_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'dispatch_transactional_email error: %', SQLERRM;
END;
$function$;


-- ===== Fix lead status trigger (drop bogus _branch_id arg) =====
CREATE OR REPLACE FUNCTION public.notify_lead_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_name text;
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'new' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '') THEN RETURN NEW; END IF;
  IF NEW.email IS NULL OR NEW.email = '' THEN RETURN NEW; END IF;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;

  BEGIN
    PERFORM public.dispatch_transactional_email(
      _template_name   := 'enrollment-status',
      _recipient_email := NEW.email,
      _template_data   := jsonb_build_object(
        'parentName',  NEW.parent_name,
        'childName',   NEW.child_name,
        'branchName',  v_branch_name,
        'stage',       NEW.status
      ),
      _idempotency_key := 'lead-status-' || NEW.id::text || '-' || NEW.status
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_lead_status_change email failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;


-- ===== Fix child absent trigger (drop _branch_id; add preference gate) =====
CREATE OR REPLACE FUNCTION public.notify_child_absent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_name text;
  v_branch_name text;
  v_date_text text;
  v_parent record;
BEGIN
  IF NEW.status <> 'absent' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'absent' THEN RETURN NEW; END IF;

  SELECT (first_name || ' ' || last_name) INTO v_child_name
  FROM public.students WHERE id = NEW.student_id;
  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
  v_date_text := to_char(NEW.date, 'Dy, FMDD Mon YYYY');

  FOR v_parent IN
    SELECT ps.parent_id, pr.email, pr.first_name
    FROM public.parent_students ps
    JOIN public.profiles pr ON pr.id = ps.parent_id
    WHERE ps.student_id = NEW.student_id AND ps.status = 'approved'
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id)
      VALUES (
        v_parent.parent_id,
        'Child marked absent',
        COALESCE(v_child_name, 'Your child') || ' was marked absent on ' || v_date_text || '.',
        'attendance',
        NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_child_absent in-app insert failed: %', SQLERRM;
    END;

    IF v_parent.email IS NOT NULL AND v_parent.email <> '' THEN
      BEGIN
        PERFORM public.dispatch_transactional_email(
          _template_name   := 'child-absent',
          _recipient_email := v_parent.email,
          _template_data   := jsonb_build_object(
            'parentName', v_parent.first_name,
            'childName',  v_child_name,
            'date',       v_date_text,
            'branchName', v_branch_name,
            'reason',     COALESCE(NEW.notes, 'absent')
          ),
          _idempotency_key := 'absent-' || NEW.student_id::text || '-' || NEW.date::text,
          _user_id         := v_parent.parent_id,
          _category        := 'attendance'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_child_absent email failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
