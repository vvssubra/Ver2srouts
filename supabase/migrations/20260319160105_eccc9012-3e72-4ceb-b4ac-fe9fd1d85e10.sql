
-- Phase 1: Billing & Receivables Foundation

-- Payer accounts for family billing
CREATE TABLE IF NOT EXISTS public.payer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  primary_parent_id uuid,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.payer_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payer_accounts_select" ON public.payer_accounts
  FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "payer_accounts_manage" ON public.payer_accounts
  FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

-- Payer-student links
CREATE TABLE IF NOT EXISTS public.payer_account_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_account_id uuid NOT NULL REFERENCES public.payer_accounts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(payer_account_id, student_id)
);

ALTER TABLE public.payer_account_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payer_students_select" ON public.payer_account_students
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payer_accounts pa
    WHERE pa.id = payer_account_id
    AND is_member_of_branch(auth.uid(), pa.branch_id)
  ));

CREATE POLICY "payer_students_manage" ON public.payer_account_students
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payer_accounts pa
    WHERE pa.id = payer_account_id
    AND is_branch_manager(auth.uid(), pa.branch_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.payer_accounts pa
    WHERE pa.id = payer_account_id
    AND is_branch_manager(auth.uid(), pa.branch_id)
  ));

-- Append-only billing ledger
CREATE TABLE IF NOT EXISTS public.billing_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  payer_account_id uuid REFERENCES public.payer_accounts(id),
  invoice_id uuid REFERENCES public.invoices(id),
  payment_id uuid REFERENCES public.payments(id),
  entry_type text NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  description text,
  reference_number text,
  metadata jsonb DEFAULT '{}',
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.billing_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_select" ON public.billing_ledger
  FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "ledger_insert" ON public.billing_ledger
  FOR INSERT TO authenticated
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

-- Billing audit logs (immutable)
CREATE TABLE IF NOT EXISTS public.billing_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_name text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.billing_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_audit_select" ON public.billing_audit_logs
  FOR SELECT TO authenticated
  USING (branch_id IS NULL OR is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "billing_audit_insert" ON public.billing_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Enhance invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payer_account_id uuid REFERENCES public.payer_accounts(id);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_description text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issued_date date;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'Due on receipt';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_billing_ledger_branch ON public.billing_ledger(branch_id);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_payer ON public.billing_ledger(payer_account_id);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_invoice ON public.billing_ledger(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_audit_entity ON public.billing_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payer_accounts_branch ON public.payer_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payer ON public.invoices(payer_account_id);
