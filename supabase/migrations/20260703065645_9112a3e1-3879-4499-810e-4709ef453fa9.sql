
-- Add Birthday Leave to leave_balances
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS birthday_total numeric(6,1) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS birthday_used  numeric(6,1) NOT NULL DEFAULT 0;

-- Backfill existing rows to entitle 1 day per year (in case DEFAULT clause was skipped by existing rows)
UPDATE public.leave_balances SET birthday_total = 1 WHERE birthday_total IS NULL OR birthday_total = 0;
