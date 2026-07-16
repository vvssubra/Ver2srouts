ALTER TABLE public.email_global_settings
  ADD COLUMN IF NOT EXISTS from_email text NOT NULL DEFAULT 'onboarding@resend.dev';