
-- =====================================================================
-- Batch 3B: school document acknowledgement email + PTM slots open email
-- + dedup digest against immediate learning update emails.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. school_documents → email + bell when a NEW required-acknowledgement
--    document is published. Branch-wide fan-out to approved parents.
--    Idempotency key embeds the document id + version so a NEW version
--    (re-uploaded) can legitimately notify again.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_school_document_required()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_branch_name text;
  v_cat_label text;
  v_action_url text := '/school-documents';
  v_doc_version text := COALESCE(NEW.version, '1');
BEGIN
  -- Only when published AND requires acknowledgement.
  IF NEW.is_active IS NOT TRUE OR NEW.is_required_for_onboarding IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- For UPDATE, only fire when this row transitions INTO (active+required)
  -- OR the version string changes (i.e. a re-publish/new version).
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.is_active IS TRUE
        AND OLD.is_required_for_onboarding IS TRUE
        AND COALESCE(OLD.version,'1') IS NOT DISTINCT FROM v_doc_version) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
  v_cat_label := UPPER(COALESCE(NEW.category, 'DOCUMENT'));

  FOR r IN
    SELECT DISTINCT ps.parent_id,
                    p.email,
                    COALESCE(p.first_name,'') AS parent_first
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE ps.status = 'approved'
      AND s.branch_id = NEW.branch_id
  LOOP
    -- In-app bell (idempotent per doc+version+parent via group_key).
    INSERT INTO public.notifications
      (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.parent_id,
      'Document requires acknowledgement',
      NEW.title || ' is ready for review.',
      'school_document_required',
      v_action_url,
      NEW.id,
      'school_doc_' || NEW.id::text || '_v' || v_doc_version || '_' || r.parent_id::text,
      'high'
    ) ON CONFLICT DO NOTHING;

    -- Email (idempotency key dedupes per document+version+parent).
    IF r.email IS NOT NULL AND r.email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'school-document-required',
        r.email,
        jsonb_build_object(
          'parentName',       r.parent_first,
          'documentTitle',    NEW.title,
          'documentCategory', v_cat_label,
          'documentVersion',  v_doc_version,
          'branchName',       v_branch_name,
          'reviewUrl',        'https://sprouts.littlegreenhearts.com/school-documents'
        ),
        'school-document-required-' || NEW.id::text || '-v' || v_doc_version || '-' || r.parent_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_school_document_required_ins ON public.school_documents;
CREATE TRIGGER trg_notify_school_document_required_ins
AFTER INSERT ON public.school_documents
FOR EACH ROW EXECUTE FUNCTION public.notify_school_document_required();

DROP TRIGGER IF EXISTS trg_notify_school_document_required_upd ON public.school_documents;
CREATE TRIGGER trg_notify_school_document_required_upd
AFTER UPDATE ON public.school_documents
FOR EACH ROW EXECUTE FUNCTION public.notify_school_document_required();


-- ---------------------------------------------------------------------
-- 2. ptm_slots → email + bell when a slot is published (status='open').
--    Targets parents in slot.class_id (or whole branch if class_id NULL).
--    Idempotency by (class-or-branch, ISO-week of slot_date, parent_id)
--    so creating many slots in one PTM batch sends ONE email per parent.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_ptm_slots_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_branch_name text;
  v_class_name text;
  v_scope_key text;
  v_week_key text;
  v_action_url text := '/parent-ptm';
  v_date_label text;
BEGIN
  -- Only fire for newly published slots.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'open' THEN RETURN NEW; END IF;
  ELSE  -- UPDATE: only when transitioning into 'open'
    IF NEW.status IS DISTINCT FROM 'open'
       OR OLD.status IS NOT DISTINCT FROM 'open' THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
  IF NEW.class_id IS NOT NULL THEN
    SELECT name INTO v_class_name FROM public.classes WHERE id = NEW.class_id;
    v_scope_key := 'class-' || NEW.class_id::text;
  ELSE
    v_scope_key := 'branch-' || NEW.branch_id::text;
  END IF;

  v_week_key := to_char(NEW.slot_date, 'IYYY"W"IW');
  v_date_label := to_char(NEW.slot_date, 'DD Mon YYYY');

  FOR r IN
    SELECT DISTINCT ps.parent_id,
                    p.email,
                    COALESCE(p.first_name,'') AS parent_first,
                    s.first_name AS child_first
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    JOIN public.profiles p ON p.id = ps.parent_id
    WHERE ps.status = 'approved'
      AND s.branch_id = NEW.branch_id
      AND (NEW.class_id IS NULL OR s.class_id = NEW.class_id)
  LOOP
    INSERT INTO public.notifications
      (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      r.parent_id,
      'PTM booking is now open',
      'New Parent–Teacher Meeting slots are available. Tap to book.',
      'ptm_slots_open',
      v_action_url,
      NEW.id,
      'ptm_slots_open_' || v_scope_key || '_' || v_week_key || '_' || r.parent_id::text,
      'normal'
    ) ON CONFLICT DO NOTHING;

    IF r.email IS NOT NULL AND r.email <> '' THEN
      PERFORM public.dispatch_transactional_email(
        'ptm-slots-open',
        r.email,
        jsonb_build_object(
          'parentName', r.parent_first,
          'childName',  r.child_first,
          'className',  v_class_name,
          'branchName', v_branch_name,
          'dateRange',  v_date_label,
          'bookingUrl', 'https://sprouts.littlegreenhearts.com/parent-ptm'
        ),
        'ptm-slots-open-' || v_scope_key || '-' || v_week_key || '-' || r.parent_id::text
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ptm_slots_open_ins ON public.ptm_slots;
CREATE TRIGGER trg_notify_ptm_slots_open_ins
AFTER INSERT ON public.ptm_slots
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_slots_open();

DROP TRIGGER IF EXISTS trg_notify_ptm_slots_open_upd ON public.ptm_slots;
CREATE TRIGGER trg_notify_ptm_slots_open_upd
AFTER UPDATE OF status ON public.ptm_slots
FOR EACH ROW EXECUTE FUNCTION public.notify_ptm_slots_open();


-- ---------------------------------------------------------------------
-- 3. Daily moments digest: skip parents whose only updates already had
--    an immediate learning-story-ready email sent today. This prevents
--    duplicate-feel emails when teachers post one update and the digest
--    also fires.
-- ---------------------------------------------------------------------
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
  _immediate_today int;
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

    IF COALESCE(_count, 0) = 0 THEN
      CONTINUE;
    END IF;

    -- Count immediate per-update emails already sent today to this parent.
    SELECT COUNT(*) INTO _immediate_today
    FROM public.email_send_log esl
    WHERE esl.recipient_email = r.email
      AND esl.template_name = 'learning-story-ready'
      AND esl.created_at::date = CURRENT_DATE;

    -- If every shared update today was already emailed individually,
    -- skip the digest to avoid duplicate-feel.
    IF _immediate_today >= _count THEN
      CONTINUE;
    END IF;

    PERFORM public.dispatch_transactional_email(
      'moments-digest',
      r.email,
      jsonb_build_object(
        'parentName',  r.parent_name,
        'branchName',  r.branch_name,
        'digestDate',  _today,
        'momentCount', _count,
        'moments',     COALESCE(_moments_json, '[]'::jsonb)
      ),
      'moments-digest-' || r.parent_id::text || '-' || to_char(CURRENT_DATE,'YYYYMMDD')
    );
  END LOOP;
END;
$$;
