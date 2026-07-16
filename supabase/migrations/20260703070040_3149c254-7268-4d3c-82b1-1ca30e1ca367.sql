ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS birthday_total numeric(6,1) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS birthday_used  numeric(6,1) NOT NULL DEFAULT 0.0;