CREATE OR REPLACE FUNCTION public.notify_branding_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text;
  service_key text;
BEGIN
  -- Pull the project URL + service role key from Vault if available, else env.
  -- Fall back to current_setting which Supabase exposes.
  BEGIN
    fn_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    fn_url := NULL;
    service_key := NULL;
  END;

  IF fn_url IS NULL OR service_key IS NULL THEN
    -- Settings not configured; skip silently. The version stamp itself
    -- still drives the in-app modal, so users will still see the prompt
    -- on next launch even without push.
    RETURN NEW;
  END IF;

  IF NEW.parent_branding_version IS DISTINCT FROM OLD.parent_branding_version THEN
    PERFORM extensions.http_post(
      url := fn_url || '/functions/v1/broadcast-branding-update',
      body := jsonb_build_object('variant', 'parents', 'app_name', NEW.parent_app_name)::text,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      timeout_milliseconds := 5000
    );
  END IF;

  IF NEW.teacher_branding_version IS DISTINCT FROM OLD.teacher_branding_version THEN
    PERFORM extensions.http_post(
      url := fn_url || '/functions/v1/broadcast-branding-update',
      body := jsonb_build_object('variant', 'teachers', 'app_name', NEW.teacher_app_name)::text,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let push failures block branding updates.
  RAISE WARNING 'notify_branding_update failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_branding_update ON public.organization_branding;
CREATE TRIGGER trg_notify_branding_update
AFTER UPDATE ON public.organization_branding
FOR EACH ROW EXECUTE FUNCTION public.notify_branding_update();