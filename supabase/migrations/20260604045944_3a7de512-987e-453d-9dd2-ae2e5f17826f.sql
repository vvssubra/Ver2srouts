
-- ============================================================
-- Helper: dispatch_transactional_email — async POST via pg_net
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_transactional_email(
  _template_name text,
  _recipient_email text,
  _template_data jsonb,
  _idempotency_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-transactional-email';
BEGIN
  IF _recipient_email IS NULL OR _recipient_email = '' THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;
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
      'templateName', _template_name,
      'recipientEmail', _recipient_email,
      'idempotencyKey', _idempotency_key,
      'templateData', _template_data
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'dispatch_transactional_email error: %', SQLERRM;
END;
$$;

-- ============================================================
-- Trigger: invoice issued → email parent
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_invoice_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_email text;
  _parent_name text;
  _student_name text;
  _branch_name text;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT p.email,
         COALESCE(p.first_name,''),
         s.first_name,
         b.name
    INTO _parent_email, _parent_name, _student_name, _branch_name
  FROM public.students s
  LEFT JOIN public.branches b ON b.id = s.branch_id
  LEFT JOIN public.parent_students ps ON ps.student_id = s.id AND ps.status = 'approved'
  LEFT JOIN public.profiles p ON p.id = ps.parent_id
  WHERE s.id = NEW.student_id
  LIMIT 1;

  IF _parent_email IS NULL OR _parent_email = '' THEN RETURN NEW; END IF;

  PERFORM public.dispatch_transactional_email(
    'invoice-issued',
    _parent_email,
    jsonb_build_object(
      'parentName', _parent_name,
      'childName', _student_name,
      'invoiceNumber', NEW.invoice_number,
      'amount', to_char(NEW.total_amount, 'FM999,999,990.00'),
      'currency', 'RM',
      'dueDate', to_char(NEW.due_date, 'DD Mon YYYY'),
      'branchName', _branch_name
    ),
    'invoice-issued-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_invoice_issued ON public.invoices;
CREATE TRIGGER trg_notify_invoice_issued
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.notify_invoice_issued();

-- ============================================================
-- Trigger: payment recorded → email receipt
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_email text;
  _parent_name text;
  _student_name text;
  _invoice record;
  _balance numeric;
BEGIN
  IF NEW.amount <= 0 OR NEW.invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT i.invoice_number, i.total_amount, i.amount_paid, i.student_id
    INTO _invoice
  FROM public.invoices i WHERE i.id = NEW.invoice_id;

  IF _invoice.student_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.email,
         COALESCE(p.first_name,''),
         s.first_name
    INTO _parent_email, _parent_name, _student_name
  FROM public.students s
  LEFT JOIN public.parent_students ps ON ps.student_id = s.id AND ps.status = 'approved'
  LEFT JOIN public.profiles p ON p.id = ps.parent_id
  WHERE s.id = _invoice.student_id
  LIMIT 1;

  IF _parent_email IS NULL OR _parent_email = '' THEN RETURN NEW; END IF;

  _balance := GREATEST(COALESCE(_invoice.total_amount,0) - COALESCE(_invoice.amount_paid,0), 0);

  PERFORM public.dispatch_transactional_email(
    'invoice-receipt',
    _parent_email,
    jsonb_build_object(
      'parentName', _parent_name,
      'childName', _student_name,
      'invoiceNumber', _invoice.invoice_number,
      'amountPaid', to_char(NEW.amount, 'FM999,999,990.00'),
      'currency', 'RM',
      'balance', to_char(_balance, 'FM999,999,990.00'),
      'paymentMethod', COALESCE(NEW.payment_method, ''),
      'paymentDate', to_char(COALESCE(NEW.payment_date, CURRENT_DATE), 'DD Mon YYYY')
    ),
    'invoice-receipt-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_receipt ON public.payments;
CREATE TRIGGER trg_notify_payment_receipt
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.notify_payment_receipt();

-- ============================================================
-- Trigger: OT request status changes → email requester
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_ot_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _email text;
  _name text;
  _company text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  SELECT p.email, COALESCE(p.first_name,''), b.name
    INTO _email, _name, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  IF _email IS NULL OR _email = '' THEN RETURN NEW; END IF;

  PERFORM public.dispatch_transactional_email(
    'ot-request-status',
    _email,
    jsonb_build_object(
      'staffName', _name,
      'status', NEW.status,
      'otDate', to_char(NEW.date, 'DD Mon YYYY'),
      'hours', to_char(COALESCE(NEW.hours,0), 'FM999,990.0'),
      'reason', COALESCE(NEW.reason, ''),
      'approverNote', COALESCE(NEW.review_notes, ''),
      'companyName', _company
    ),
    'ot-status-' || NEW.id::text || '-' || NEW.status
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ot_status_change ON public.overtime_requests;
CREATE TRIGGER trg_notify_ot_status_change
AFTER UPDATE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_ot_status_change();

-- ============================================================
-- Trigger: Claim status changes → email requester
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_claim_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  _note := COALESCE(NEW.level2_notes, NEW.level1_notes, '');

  PERFORM public.dispatch_transactional_email(
    'claim-status',
    _email,
    jsonb_build_object(
      'staffName', _name,
      'status', NEW.status,
      'claimTitle', COALESCE(NEW.description, ''),
      'claimType', COALESCE(initcap(NEW.claim_type), ''),
      'amount', to_char(COALESCE(NEW.amount,0), 'FM999,999,990.00'),
      'currency', 'RM',
      'approverNote', _note,
      'companyName', _company
    ),
    'claim-status-' || NEW.id::text || '-' || NEW.status
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_claim_status_change ON public.staff_claims;
CREATE TRIGGER trg_notify_claim_status_change
AFTER UPDATE ON public.staff_claims
FOR EACH ROW EXECUTE FUNCTION public.notify_claim_status_change();

-- ============================================================
-- Trigger: Leave status changes → email requester
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_leave_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      'leaveType', COALESCE(NEW.leave_type, ''),
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
$$;

DROP TRIGGER IF EXISTS trg_notify_leave_status_change ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_status_change
AFTER UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_leave_status_change();

-- ============================================================
-- Trigger: Payroll published / paid → email staff
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_payslip_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _email text;
  _name text;
  _company text;
  _period text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','paid') THEN RETURN NEW; END IF;
  -- Only send once per status change of approved or paid
  IF OLD.status IN ('approved','paid') THEN RETURN NEW; END IF;

  SELECT p.email, COALESCE(p.first_name,''), b.name
    INTO _email, _name, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  IF _email IS NULL OR _email = '' THEN RETURN NEW; END IF;

  _period := to_char(make_date(NEW.year, NEW.month, 1), 'Mon YYYY');

  PERFORM public.dispatch_transactional_email(
    'payslip-published',
    _email,
    jsonb_build_object(
      'staffName', _name,
      'period', _period,
      'netSalary', to_char(COALESCE(NEW.net_salary,0), 'FM999,999,990.00'),
      'currency', 'RM',
      'companyName', _company
    ),
    'payslip-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payslip_published ON public.payroll_records;
CREATE TRIGGER trg_notify_payslip_published
AFTER UPDATE ON public.payroll_records
FOR EACH ROW EXECUTE FUNCTION public.notify_payslip_published();

-- ============================================================
-- Trigger: Announcements broadcast → email parents
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_announcement_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  _branch_name text;
BEGIN
  -- Only email when targeting parents (audience='parents' or includes parents)
  IF NEW.audience IS NOT NULL AND NEW.audience NOT IN ('parents','all') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _branch_name FROM public.branches WHERE id = NEW.branch_id;

  FOR r IN
    SELECT DISTINCT p.email, COALESCE(p.first_name,'') AS name
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE s.branch_id = NEW.branch_id
      AND s.is_active = true
      AND ps.status = 'approved'
      AND p.email IS NOT NULL AND p.email <> ''
      AND (
        NEW.target_type = 'all'
        OR NEW.target_type IS NULL
        OR (NEW.target_type = 'class' AND s.class_id = ANY(COALESCE(NEW.target_class, ARRAY[]::uuid[])))
        OR (NEW.target_type = 'parents' AND p.id = ANY(COALESCE(NEW.target_parent_ids, ARRAY[]::uuid[])))
      )
  LOOP
    PERFORM public.dispatch_transactional_email(
      'school-announcement',
      r.email,
      jsonb_build_object(
        'recipientName', r.name,
        'announcementTitle', NEW.title,
        'announcementBody', NEW.body,
        'branchName', _branch_name
      ),
      'announcement-' || NEW.id::text || '-' || md5(r.email)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_announcement_broadcast ON public.announcements;
CREATE TRIGGER trg_notify_announcement_broadcast
AFTER INSERT ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.notify_announcement_broadcast();

-- ============================================================
-- Helper: send payment reminders (called by cron)
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_payment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  _stage text;
  _days_diff int;
BEGIN
  FOR r IN
    SELECT i.*, s.first_name AS student_first,
           p.email AS parent_email, COALESCE(p.first_name,'') AS parent_name,
           b.name AS branch_name,
           (i.due_date - CURRENT_DATE) AS days_to_due
    FROM public.invoices i
    JOIN public.students s ON s.id = i.student_id
    LEFT JOIN public.branches b ON b.id = i.branch_id
    LEFT JOIN public.parent_students ps ON ps.student_id = s.id AND ps.status = 'approved'
    LEFT JOIN public.profiles p ON p.id = ps.parent_id
    WHERE i.status NOT IN ('paid','cancelled')
      AND i.due_date IS NOT NULL
      AND p.email IS NOT NULL AND p.email <> ''
      AND (i.due_date - CURRENT_DATE) IN (7, 0, -3, -7, -14)
  LOOP
    _days_diff := r.days_to_due;
    _stage := CASE
      WHEN _days_diff = 7 THEN 'upcoming'
      WHEN _days_diff = 0 THEN 'due_today'
      WHEN _days_diff = -3 THEN 'overdue_3'
      WHEN _days_diff = -7 THEN 'overdue_7'
      WHEN _days_diff = -14 THEN 'overdue_14'
    END;

    PERFORM public.dispatch_transactional_email(
      'payment-reminder',
      r.parent_email,
      jsonb_build_object(
        'parentName', r.parent_name,
        'childName', r.student_first,
        'invoiceNumber', r.invoice_number,
        'amount', to_char(GREATEST(COALESCE(r.total_amount,0) - COALESCE(r.amount_paid,0), 0), 'FM999,999,990.00'),
        'currency', 'RM',
        'dueDate', to_char(r.due_date, 'DD Mon YYYY'),
        'stage', _stage,
        'branchName', r.branch_name
      ),
      'pay-reminder-' || r.id::text || '-' || _stage || '-' || to_char(CURRENT_DATE,'YYYYMMDD')
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Helper: send daily moments digest
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_moments_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  _moments_json jsonb;
  _count int;
  _today text := to_char(CURRENT_DATE, 'DD Mon YYYY');
BEGIN
  FOR r IN
    SELECT ps.parent_id, p.email, COALESCE(p.first_name,'') AS parent_name,
           b.name AS branch_name
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE ps.status = 'approved'
      AND p.email IS NOT NULL AND p.email <> ''
    GROUP BY ps.parent_id, p.email, p.first_name, b.name
  LOOP
    -- Aggregate today's visible moments for all the parent's children
    SELECT jsonb_agg(jsonb_build_object(
             'studentName', s.first_name,
             'caption', COALESCE(cu.caption, ''),
             'date', _today
           )) FILTER (WHERE cu.id IS NOT NULL),
           COUNT(cu.id)
      INTO _moments_json, _count
    FROM public.parent_students ps2
    JOIN public.students s ON s.id = ps2.student_id
    LEFT JOIN public.child_updates cu ON cu.student_id = s.id
      AND cu.visible_to_parent = true
      AND cu.created_at::date = CURRENT_DATE
    WHERE ps2.parent_id = r.parent_id
      AND ps2.status = 'approved';

    IF _count > 0 THEN
      PERFORM public.dispatch_transactional_email(
        'moments-digest',
        r.email,
        jsonb_build_object(
          'parentName', r.parent_name,
          'branchName', r.branch_name,
          'digestDate', _today,
          'momentCount', _count,
          'moments', COALESCE(_moments_json, '[]'::jsonb)
        ),
        'moments-digest-' || r.parent_id::text || '-' || to_char(CURRENT_DATE,'YYYYMMDD')
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- Helper: send missed chat reminders (30+ min unread)
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_missed_chat_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- Find conversations with messages > 30 min old where last_read_at is older than message
  FOR r IN
    SELECT
      cp.user_id AS recipient_id,
      p.email AS recipient_email,
      COALESCE(p.first_name,'') AS recipient_name,
      MAX(m.created_at) AS last_message_at,
      COUNT(m.id) AS unread_count,
      (SELECT COALESCE(sp.first_name,'') || ' ' || COALESCE(sp.last_name,'')
         FROM public.messages m2
         JOIN public.profiles sp ON sp.id = m2.sender_id
         WHERE m2.conversation_id = cp.conversation_id
           AND m2.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
         ORDER BY m2.created_at DESC LIMIT 1) AS sender_name,
      (SELECT m3.content FROM public.messages m3
         WHERE m3.conversation_id = cp.conversation_id
           AND m3.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
         ORDER BY m3.created_at DESC LIMIT 1) AS preview
    FROM public.conversation_participants cp
    JOIN public.messages m ON m.conversation_id = cp.conversation_id
      AND m.sender_id <> cp.user_id
      AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
      AND m.created_at < now() - interval '30 minutes'
      AND m.created_at > now() - interval '24 hours'
    JOIN public.profiles p ON p.id = cp.user_id
    WHERE p.email IS NOT NULL AND p.email <> ''
    GROUP BY cp.user_id, cp.conversation_id, cp.last_read_at, p.email, p.first_name
    HAVING COUNT(m.id) > 0
  LOOP
    PERFORM public.dispatch_transactional_email(
      'chat-message-missed',
      r.recipient_email,
      jsonb_build_object(
        'recipientName', r.recipient_name,
        'senderName', COALESCE(trim(r.sender_name), 'Someone'),
        'messagePreview', LEFT(COALESCE(r.preview, ''), 140),
        'messageCount', r.unread_count
      ),
      'chat-missed-' || r.recipient_id::text || '-' || to_char(r.last_message_at, 'YYYYMMDDHH24MI')
    );
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Tables (conversation_participants/messages) may not exist in every deployment.
  RAISE LOG 'send_missed_chat_reminders skipped: %', SQLERRM;
END;
$$;
