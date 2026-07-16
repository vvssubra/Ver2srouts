ALTER TABLE public.branch_settings
  ADD COLUMN IF NOT EXISTS email_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS email_brand_color TEXT DEFAULT '#7c3aed',
  ADD COLUMN IF NOT EXISTS email_footer_text TEXT,
  ADD COLUMN IF NOT EXISTS email_from_address TEXT;