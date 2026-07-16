ALTER TABLE public.leave_balances 
  ADD COLUMN IF NOT EXISTS hospitalisation_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hospitalisation_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_total integer DEFAULT NULL;