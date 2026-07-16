
-- Payroll records table for storing monthly statutory deduction calculations
CREATE TABLE public.payroll_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  basic_salary NUMERIC(10,2) NOT NULL,
  allowances NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_salary NUMERIC(10,2) NOT NULL,
  epf_employee NUMERIC(10,2) NOT NULL DEFAULT 0,
  epf_employer NUMERIC(10,2) NOT NULL DEFAULT 0,
  socso_employee NUMERIC(10,2) NOT NULL DEFAULT 0,
  socso_employer NUMERIC(10,2) NOT NULL DEFAULT 0,
  eis_employee NUMERIC(10,2) NOT NULL DEFAULT 0,
  eis_employer NUMERIC(10,2) NOT NULL DEFAULT 0,
  pcb_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, month, year)
);

-- Enable RLS
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Super admins manage all payroll"
ON public.payroll_records FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Franchisees can manage branch payroll"
ON public.payroll_records FOR ALL
USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Staff can view own payroll"
ON public.payroll_records FOR SELECT
USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER update_payroll_records_updated_at
BEFORE UPDATE ON public.payroll_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
