
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS payroll_month INTEGER;
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS payroll_year INTEGER;
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS paid_by UUID;
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS paid_via TEXT DEFAULT 'payroll';
ALTER TABLE public.staff_claims ADD COLUMN IF NOT EXISTS payment_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_claims_payroll_period ON public.staff_claims (payroll_month, payroll_year);
