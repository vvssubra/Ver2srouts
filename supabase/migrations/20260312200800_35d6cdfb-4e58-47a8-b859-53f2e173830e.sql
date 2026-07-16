
-- Trigger function: auto-email parent when a gap is inserted/updated to 'pending'
CREATE OR REPLACE FUNCTION public.notify_parent_gap_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _student_name text;
  _parent_email text;
  _branch_id uuid;
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-email';
BEGIN
  -- Only fire for pending status
  IF NEW.remediation_status != 'pending' THEN
    RETURN NEW;
  END IF;

  -- Get student name and branch
  SELECT s.first_name || ' ' || s.last_name, s.branch_id
  INTO _student_name, _branch_id
  FROM public.students s
  WHERE s.id = NEW.student_id;

  IF _student_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get parent email via parent_students join
  SELECT p.email INTO _parent_email
  FROM public.parent_students ps
  JOIN public.profiles p ON p.id = ps.parent_user_id
  WHERE ps.student_id = NEW.student_id
  LIMIT 1;

  IF _parent_email IS NULL OR _parent_email = '' THEN
    RETURN NEW;
  END IF;

  -- Get service role key from vault
  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    RAISE LOG 'notify_parent_gap_email: service_role_key not found';
    RETURN NEW;
  END IF;

  -- Call send-email edge function via pg_net
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'type', 'gap_intervention',
      'to', _parent_email,
      'branchId', _branch_id::text,
      'data', jsonb_build_object(
        'studentName', _student_name,
        'gapDescription', COALESCE(NEW.gap_description, 'a learning area that needs practice'),
        'gapSubject', COALESCE(NEW.gap_subject, 'General'),
        'missingStandards', COALESCE(NEW.missing_standard_codes::text, '[]')
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_parent_gap_email error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger on student_gap_analysis
DROP TRIGGER IF EXISTS trg_gap_parent_email ON public.student_gap_analysis;
CREATE TRIGGER trg_gap_parent_email
  AFTER INSERT OR UPDATE ON public.student_gap_analysis
  FOR EACH ROW
  WHEN (NEW.remediation_status = 'pending')
  EXECUTE FUNCTION public.notify_parent_gap_email();
