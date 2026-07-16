
-- ============ ENROLMENT STATUS EMAIL ============
CREATE OR REPLACE FUNCTION public.notify_lead_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_name text;
BEGIN
  -- Only fire on real status changes, never on initial 'new'
  IF NEW.status IS NULL OR NEW.status = 'new' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') = COALESCE(NEW.status, '') THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;

  BEGIN
    PERFORM public.dispatch_transactional_email(
      _template_name   := 'enrollment-status',
      _recipient_email := NEW.email,
      _branch_id       := NEW.branch_id,
      _idempotency_key := 'lead-status-' || NEW.id::text || '-' || NEW.status,
      _template_data   := jsonb_build_object(
        'parentName',  NEW.parent_name,
        'childName',   NEW.child_name,
        'branchName',  v_branch_name,
        'stage',       NEW.status
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_lead_status_change email failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lead_status_change ON public.leads;
CREATE TRIGGER trg_notify_lead_status_change
AFTER INSERT OR UPDATE OF status ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_lead_status_change();


-- ============ CHILD ABSENT ALERT ============
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
  -- Only when row is absent (insert or status changed to absent)
  IF NEW.status <> 'absent' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'absent' THEN
    -- already absent, don't resend
    RETURN NEW;
  END IF;

  SELECT (first_name || ' ' || last_name) INTO v_child_name
  FROM public.students WHERE id = NEW.student_id;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
  v_date_text := to_char(NEW.date, 'Dy, FMDD Mon YYYY');

  FOR v_parent IN
    SELECT ps.parent_id, pr.email, pr.first_name
    FROM public.parent_students ps
    JOIN public.profiles pr ON pr.id = ps.parent_id
    WHERE ps.student_id = NEW.student_id
      AND ps.status = 'approved'
  LOOP
    -- in-app
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

    -- email
    IF v_parent.email IS NOT NULL AND v_parent.email <> '' THEN
      BEGIN
        PERFORM public.dispatch_transactional_email(
          _template_name   := 'child-absent',
          _recipient_email := v_parent.email,
          _branch_id       := NEW.branch_id,
          _idempotency_key := 'absent-' || NEW.student_id::text || '-' || NEW.date::text,
          _template_data   := jsonb_build_object(
            'parentName', v_parent.first_name,
            'childName',  v_child_name,
            'date',       v_date_text,
            'branchName', v_branch_name,
            'reason',     COALESCE(NEW.notes, 'absent')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_child_absent email failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_child_absent ON public.attendance;
CREATE TRIGGER trg_notify_child_absent
AFTER INSERT OR UPDATE OF status ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.notify_child_absent();
