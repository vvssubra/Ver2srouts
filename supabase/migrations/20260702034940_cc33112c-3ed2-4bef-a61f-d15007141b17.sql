ALTER TABLE public.leave_balances ALTER COLUMN unpaid_total SET DEFAULT 10;
UPDATE public.leave_balances SET unpaid_total = 10 WHERE unpaid_total IS NULL OR unpaid_total = 0;