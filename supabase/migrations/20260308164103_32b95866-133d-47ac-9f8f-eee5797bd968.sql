
-- Add LHDN e-Invoice UIN and payment_method to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS lhdn_uin text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';

-- Expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'supplies',
  amount numeric NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  receipt_url text,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view expenses" ON public.expenses FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Franchisees manage branch expenses" ON public.expenses FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- Branch financials (monthly snapshots)
CREATE TABLE public.branch_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month_year date NOT NULL,
  total_revenue numeric DEFAULT 0,
  total_expenses numeric DEFAULT 0,
  royalty_fee_due numeric DEFAULT 0,
  cost_per_student numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, month_year)
);
ALTER TABLE public.branch_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view financials" ON public.branch_financials FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage financials" ON public.branch_financials FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- Storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false);

CREATE POLICY "Branch members upload receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');
CREATE POLICY "Branch members view receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');
CREATE POLICY "Admins delete receipts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND is_super_admin(auth.uid()));
