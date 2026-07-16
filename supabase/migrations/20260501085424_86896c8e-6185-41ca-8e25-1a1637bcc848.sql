-- Add general (admin/staff/web) icon to organization branding
ALTER TABLE public.organization_branding
  ADD COLUMN IF NOT EXISTS general_icon_url TEXT,
  ADD COLUMN IF NOT EXISTS general_app_name TEXT,
  ADD COLUMN IF NOT EXISTS general_branding_version TIMESTAMPTZ DEFAULT now();

-- Update the version bump trigger to also stamp general_branding_version
CREATE OR REPLACE FUNCTION public.bump_branding_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_icon_url IS DISTINCT FROM OLD.parent_icon_url
     OR NEW.parent_app_name IS DISTINCT FROM OLD.parent_app_name
     OR NEW.parent_app_short_name IS DISTINCT FROM OLD.parent_app_short_name
     OR NEW.parent_theme_color IS DISTINCT FROM OLD.parent_theme_color THEN
    NEW.parent_branding_version := now();
  END IF;

  IF NEW.teacher_icon_url IS DISTINCT FROM OLD.teacher_icon_url
     OR NEW.teacher_app_name IS DISTINCT FROM OLD.teacher_app_name
     OR NEW.teacher_app_short_name IS DISTINCT FROM OLD.teacher_app_short_name
     OR NEW.teacher_theme_color IS DISTINCT FROM OLD.teacher_theme_color THEN
    NEW.teacher_branding_version := now();
  END IF;

  IF NEW.general_icon_url IS DISTINCT FROM OLD.general_icon_url
     OR NEW.general_app_name IS DISTINCT FROM OLD.general_app_name THEN
    NEW.general_branding_version := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Allow public read of branding so the manifest/login screen can resolve icons
-- (already public via existing policy presumably; safe no-op if so)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_branding'
      AND policyname = 'Public can read branding'
  ) THEN
    CREATE POLICY "Public can read branding"
      ON public.organization_branding
      FOR SELECT
      USING (true);
  END IF;
END $$;