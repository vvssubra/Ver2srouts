
-- Global email settings (single row)
CREATE TABLE public.email_global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  from_name text NOT NULL DEFAULT 'Sprouts',
  reply_to_email text,
  support_email text DEFAULT 'hello@littlegreenhearts.com',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_global_settings_singleton_check CHECK (singleton = true)
);

GRANT SELECT ON public.email_global_settings TO authenticated;
GRANT ALL ON public.email_global_settings TO service_role;

ALTER TABLE public.email_global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email settings"
ON public.email_global_settings FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
);

-- Seed the singleton
INSERT INTO public.email_global_settings (singleton, from_name)
VALUES (true, 'Sprouts')
ON CONFLICT DO NOTHING;

CREATE TRIGGER email_global_settings_updated_at
BEFORE UPDATE ON public.email_global_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-template overrides
CREATE TABLE public.email_template_overrides (
  template_name text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  subject text,
  content_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_template_overrides TO authenticated;
GRANT ALL ON public.email_template_overrides TO service_role;

ALTER TABLE public.email_template_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage template overrides"
ON public.email_template_overrides FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE TRIGGER email_template_overrides_updated_at
BEFORE UPDATE ON public.email_template_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track sent welcome-kit emails to dedupe (one per parent)
CREATE TABLE public.parent_welcome_email_sent (
  parent_user_id uuid PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.parent_welcome_email_sent TO authenticated;
GRANT ALL ON public.parent_welcome_email_sent TO service_role;

ALTER TABLE public.parent_welcome_email_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read welcome sent log"
ON public.parent_welcome_email_sent FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Service writes welcome sent log"
ON public.parent_welcome_email_sent FOR INSERT TO authenticated
WITH CHECK (true);
