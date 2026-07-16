ALTER TABLE public.payroll_records 
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_worked integer DEFAULT 0;