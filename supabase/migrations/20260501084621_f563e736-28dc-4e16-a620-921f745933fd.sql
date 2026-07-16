ALTER TABLE public.organization_branding
  ADD COLUMN IF NOT EXISTS parent_branding_version TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS teacher_branding_version TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.bump_branding_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.parent_app_name IS DISTINCT FROM OLD.parent_app_name
       OR NEW.parent_app_short_name IS DISTINCT FROM OLD.parent_app_short_name
       OR NEW.parent_icon_url IS DISTINCT FROM OLD.parent_icon_url
       OR NEW.parent_theme_color IS DISTINCT FROM OLD.parent_theme_color THEN
      NEW.parent_branding_version := now();
    END IF;
    IF NEW.teacher_app_name IS DISTINCT FROM OLD.teacher_app_name
       OR NEW.teacher_app_short_name IS DISTINCT FROM OLD.teacher_app_short_name
       OR NEW.teacher_icon_url IS DISTINCT FROM OLD.teacher_icon_url
       OR NEW.teacher_theme_color IS DISTINCT FROM OLD.teacher_theme_color THEN
      NEW.teacher_branding_version := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_branding_version ON public.organization_branding;
CREATE TRIGGER trg_bump_branding_version
BEFORE UPDATE ON public.organization_branding
FOR EACH ROW EXECUTE FUNCTION public.bump_branding_version();