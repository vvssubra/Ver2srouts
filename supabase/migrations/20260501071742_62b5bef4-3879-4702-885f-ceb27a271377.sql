-- Organization branding for the customizable PWA icons (parent + teacher apps)
CREATE TABLE IF NOT EXISTS public.organization_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
  parent_app_name text NOT NULL DEFAULT 'Sprouts for Parents',
  parent_app_short_name text NOT NULL DEFAULT 'Sprouts',
  parent_icon_url text,
  parent_theme_color text NOT NULL DEFAULT '#ee5a70',
  teacher_app_name text NOT NULL DEFAULT 'Sprouts for Teachers',
  teacher_app_short_name text NOT NULL DEFAULT 'Sprouts Staff',
  teacher_icon_url text,
  teacher_theme_color text NOT NULL DEFAULT '#7c3aed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_branding ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated install pages) may read branding
CREATE POLICY "Branding is publicly viewable"
  ON public.organization_branding
  FOR SELECT
  USING (true);

-- Only super admins may insert / update branding
CREATE POLICY "Super admin can insert branding"
  ON public.organization_branding
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin can update branding"
  ON public.organization_branding
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin can delete branding"
  ON public.organization_branding
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Updated-at trigger
DROP TRIGGER IF EXISTS trg_organization_branding_updated_at ON public.organization_branding;
CREATE TRIGGER trg_organization_branding_updated_at
  BEFORE UPDATE ON public.organization_branding
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for uploaded icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Public read of branding bucket
DROP POLICY IF EXISTS "Branding files are publicly viewable" ON storage.objects;
CREATE POLICY "Branding files are publicly viewable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding');

-- Only super admins can upload / replace / delete branding files
DROP POLICY IF EXISTS "Super admin can upload branding" ON storage.objects;
CREATE POLICY "Super admin can upload branding"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admin can update branding" ON storage.objects;
CREATE POLICY "Super admin can update branding"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admin can delete branding" ON storage.objects;
CREATE POLICY "Super admin can delete branding"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.has_role(auth.uid(), 'super_admin'::app_role)
  );