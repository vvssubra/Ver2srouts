ALTER TABLE public.payment_reversals
  ADD COLUMN IF NOT EXISTS reversed_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reversed_method TEXT,
  ADD COLUMN IF NOT EXISTS reversed_reference TEXT,
  ADD COLUMN IF NOT EXISTS reversed_payer TEXT;