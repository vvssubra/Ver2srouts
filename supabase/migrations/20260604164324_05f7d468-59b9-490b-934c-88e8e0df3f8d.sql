
-- =====================================================================
-- P1: Approval-pending emails for OT, Claim, Leave INSERTs
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_approval_pending_email(
  _branch_id uuid,
  _exclude_user_id uuid,
  _requester_name text,
  _request_type text,
  _summary text,
  _details jsonb,
  _company_name text,
  _ref_id uuid,
  _idem_prefix text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _approvers uuid[];
  _uid uuid;
  _email text;
  _name text;
BEGIN
  _approvers := public.get_branch_approver_ids(_branch_id);
  FOREACH _uid IN ARRAY _approvers LOOP
    IF _uid IS DISTINCT FROM _exclude_user_id THEN
      SELECT email, COALESCE(first_name,'')
        INTO _email, _name
      FROM public.profiles WHERE id = _uid;
      IF _email IS NOT NULL AND _email <> '' THEN
        PERFORM public.dispatch_transactional_email(
          'approval-pending',
          _email,
          jsonb_build_object(
            'approverName', _name,
            'requesterName', _requester_name,
            'requestType', _request_type,
            'summary', _summary,
            'details', _details,
            'companyName', _company_name
          ),
          _idem_prefix || '-' || _ref_id::text || '-' || _uid::text
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- OT submission
CREATE OR REPLACE FUNCTION public.notify_ot_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requester text;
  _company text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Overtime request awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted ' || to_char(COALESCE(NEW.hours,0),'FM990.0') || 'h OT on ' || to_char(NEW.date,'DD Mon YYYY'),
    'ot_pending', '/hr/overtime', NEW.id,
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
    _company, NEW.id, 'ot-pending'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ot_submitted ON public.overtime_requests;
CREATE TRIGGER trg_notify_ot_submitted
AFTER INSERT ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_ot_submitted();

-- Claim submission
CREATE OR REPLACE FUNCTION public.notify_claim_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requester text;
  _company text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;

  SELECT COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''),
         b.name
    INTO _requester, _company
  FROM public.profiles p
  LEFT JOIN public.branches b ON b.id = NEW.branch_id
  WHERE p.id = NEW.user_id;

  PERFORM public.notify_approvers(
    NEW.branch_id, NEW.user_id,
    'Claim awaiting approval',
    COALESCE(trim(_requester),'A staff member') || ' submitted a ' || COALESCE(initcap(NEW.claim_type),'general') || ' claim of RM ' || to_char(COALESCE(NEW.amount,0),'FM999,990.00'),
    'claim_pending', '/hr/claims', NEW.id,
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
    _company, NEW.id, 'claim-pending'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_claim_submitted ON public.staff_claims;
CREATE TRIGGER trg_notify_claim_submitted
AFTER INSERT ON public.staff_claims
FOR EACH ROW EXECUTE FUNCTION public.notify_claim_submitted();

-- Leave submission
CREATE OR REPLACE FUNCTION public.notify_leave_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _requester text;
  _company text;
BEGIN
  IF NEW.status NOT IN ('pending','submitted') THEN RETURN NEW; END IF;

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

DROP TRIGGER IF EXISTS trg_notify_leave_submitted ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_submitted
AFTER INSERT ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_leave_submitted();

-- =====================================================================
-- P1: parent-ptm-status email (extend existing trigger to also send email)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_ptm_booking_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slot RECORD;
  v_student_first text;
  v_student_full text;
  v_parent_email text;
  v_parent_name text;
  v_teacher_name text;
  v_branch_name text;
  v_email_status text;
  v_title text;
  v_msg text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;

  SELECT first_name, first_name || ' ' || COALESCE(last_name,'')
    INTO v_student_first, v_student_full
  FROM public.students WHERE id = NEW.student_id;

  SELECT p.email, COALESCE(p.first_name,'')
    INTO v_parent_email, v_parent_name
  FROM public.profiles p WHERE p.id = NEW.parent_id;

  SELECT COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')
    INTO v_teacher_name
  FROM public.profiles WHERE id = v_slot.teacher_id;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;

  -- In-app (unchanged behaviour)
  IF NEW.status = 'confirmed' THEN
    v_title := 'PTM confirmed';
    v_msg := 'Your PTM for ' || COALESCE(v_student_full,'your child')
             || ' on ' || to_char(v_slot.slot_date,'DD Mon YYYY')
             || ' at ' || to_char(v_slot.start_time,'HH24:MI') || ' is confirmed.';
    v_email_status := 'scheduled';
  ELSIF NEW.status = 'declined' THEN
    v_title := 'PTM request declined';
    v_msg := 'Your PTM request for ' || COALESCE(v_student_full,'your child') || ' was declined.';
    v_email_status := 'cancelled';
  ELSIF NEW.status = 'cancelled' THEN
    v_title := 'PTM cancelled';
    v_msg := 'Your PTM for ' || COALESCE(v_student_full,'your child') || ' has been cancelled.';
    v_email_status := 'cancelled';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
  VALUES (
    NEW.parent_id, v_title, v_msg, 'ptm_status_change',
    '/parent-ptm', NEW.id,
    'ptm_status_' || NEW.id::text || '_' || NEW.status,
    'high'
  );

  -- Email parent
  IF v_parent_email IS NOT NULL AND v_parent_email <> '' THEN
    PERFORM public.dispatch_transactional_email(
      'parent-ptm-status',
      v_parent_email,
      jsonb_build_object(
        'parentName', v_parent_name,
        'childName', v_student_first,
        'teacherName', trim(v_teacher_name),
        'branchName', v_branch_name,
        'status', v_email_status,
        'meetingDate', to_char(v_slot.slot_date,'Dy, DD Mon YYYY'),
        'meetingTime', to_char(v_slot.start_time,'HH12:MI AM'),
        'location', COALESCE(v_slot.location,''),
        'notes', COALESCE(NEW.staff_notes,'')
      ),
      'ptm-email-' || NEW.id::text || '-' || NEW.status
    );
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- P1: learning-story-ready email when monthly summary is published
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_monthly_summary_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  _student RECORD;
  _branch_name text;
  _month_label text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'published' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'published' THEN RETURN NEW; END IF;

  SELECT first_name, branch_id INTO _student
  FROM public.students WHERE id = NEW.student_id;

  SELECT name INTO _branch_name FROM public.branches WHERE id = _student.branch_id;
  _month_label := upper(to_char(make_date(NEW.year, NEW.month, 1),'Mon YYYY'));

  FOR r IN
    SELECT p.id, p.email, COALESCE(p.first_name,'') AS name
    FROM public.parent_students ps
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE ps.student_id = NEW.student_id
      AND ps.status = 'approved'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.id,
      _student.first_name || '''s ' || _month_label || ' learning story is ready',
      'A new monthly learning summary has been published.',
      'learning_story_ready',
      '/learning-stories?student=' || NEW.student_id::text,
      NEW.id,
      'lstory_' || NEW.id::text || '_' || r.id::text,
      'normal'
    )
    ON CONFLICT DO NOTHING;

    IF r.email IS NOT NULL AND r.email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'learning-story-ready',
        r.email,
        jsonb_build_object(
          'parentName', r.name,
          'childName', _student.first_name,
          'storyTitle', _student.first_name || '''s ' || _month_label || ' journey',
          'monthLabel', _month_label,
          'previewText', left(COALESCE(NEW.summary_text,''), 180),
          'branchName', _branch_name
        ),
        'lstory-' || NEW.id::text || '-' || r.id::text
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_monthly_summary_published_ins ON public.student_monthly_summaries;
CREATE TRIGGER trg_notify_monthly_summary_published_ins
AFTER INSERT ON public.student_monthly_summaries
FOR EACH ROW EXECUTE FUNCTION public.notify_monthly_summary_published();

DROP TRIGGER IF EXISTS trg_notify_monthly_summary_published_upd ON public.student_monthly_summaries;
CREATE TRIGGER trg_notify_monthly_summary_published_upd
AFTER UPDATE OF status ON public.student_monthly_summaries
FOR EACH ROW EXECUTE FUNCTION public.notify_monthly_summary_published();

-- =====================================================================
-- P2: In-app notifications for invoice issued + announcement broadcast
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_invoice_issued()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _parent_email text;
  _parent_name text;
  _parent_id uuid;
  _student_name text;
  _branch_name text;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Email primary parent (existing behaviour) + in-app to ALL approved parents
  SELECT p.email, COALESCE(p.first_name,''), p.id, s.first_name, b.name
    INTO _parent_email, _parent_name, _parent_id, _student_name, _branch_name
  FROM public.students s
  LEFT JOIN public.branches b ON b.id = s.branch_id
  LEFT JOIN public.parent_students ps ON ps.student_id = s.id AND ps.status = 'approved'
  LEFT JOIN public.profiles p ON p.id = ps.parent_id
  WHERE s.id = NEW.student_id
  LIMIT 1;

  IF _parent_email IS NOT NULL AND _parent_email <> '' THEN
    PERFORM public.dispatch_transactional_email(
      'invoice-issued', _parent_email,
      jsonb_build_object(
        'parentName', _parent_name,
        'childName', _student_name,
        'invoiceNumber', NEW.invoice_number,
        'amount', to_char(NEW.total_amount,'FM999,999,990.00'),
        'currency', 'RM',
        'dueDate', to_char(NEW.due_date,'DD Mon YYYY'),
        'branchName', _branch_name
      ),
      'invoice-issued-' || NEW.id::text
    );
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
  SELECT ps.parent_id,
         'New invoice ' || NEW.invoice_number,
         'RM ' || to_char(NEW.total_amount,'FM999,999,990.00')
           || ' due ' || to_char(NEW.due_date,'DD Mon YYYY')
           || COALESCE(' for ' || _student_name,''),
         'invoice_issued',
         '/parent/billing?invoice=' || NEW.id::text,
         NEW.id,
         'invoice_' || NEW.id::text || '_' || ps.parent_id::text,
         'high'
  FROM public.parent_students ps
  WHERE ps.student_id = NEW.student_id AND ps.status = 'approved'
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_announcement_broadcast()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  _branch_name text;
BEGIN
  IF NEW.audience IS NOT NULL AND NEW.audience NOT IN ('parents','all') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _branch_name FROM public.branches WHERE id = NEW.branch_id;

  FOR r IN
    SELECT DISTINCT p.id AS parent_id, p.email, COALESCE(p.first_name,'') AS name
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE s.branch_id = NEW.branch_id
      AND s.is_active = true
      AND ps.status = 'approved'
      AND (
        NEW.target_type = 'all' OR NEW.target_type IS NULL
        OR (NEW.target_type = 'class' AND s.class_id = ANY(COALESCE(NEW.target_class, ARRAY[]::uuid[])))
        OR (NEW.target_type = 'parents' AND p.id = ANY(COALESCE(NEW.target_parent_ids, ARRAY[]::uuid[])))
      )
  LOOP
    -- In-app
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.parent_id,
      NEW.title,
      left(COALESCE(NEW.body,''), 240),
      'school_announcement',
      '/parent/announcements?id=' || NEW.id::text,
      NEW.id,
      'announce_' || NEW.id::text || '_' || r.parent_id::text,
      'normal'
    )
    ON CONFLICT DO NOTHING;

    -- Email (existing)
    IF r.email IS NOT NULL AND r.email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'school-announcement', r.email,
        jsonb_build_object(
          'recipientName', r.name,
          'announcementTitle', NEW.title,
          'announcementBody', NEW.body,
          'branchName', _branch_name
        ),
        'announcement-' || NEW.id::text || '-' || md5(r.email)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
