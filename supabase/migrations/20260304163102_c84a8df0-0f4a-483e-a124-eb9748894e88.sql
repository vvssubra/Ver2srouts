
-- Chart of Accounts
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'expense', -- revenue, expense, asset, liability
  category text, -- sub-category e.g. 'salary', 'rent', 'tuition'
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false, -- system-created accounts can't be deleted
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, code)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Franchisees manage branch accounts" ON public.accounts FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage accounts" ON public.accounts FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Branch members view accounts" ON public.accounts FOR SELECT
  USING (is_member_of_branch(auth.uid(), branch_id));

-- Transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  type text NOT NULL DEFAULT 'expense', -- income, expense
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  reference_type text, -- 'payroll', 'invoice', 'claim', 'manual'
  reference_id uuid, -- links to payroll_records.id, invoices.id, staff_claims.id
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Franchisees manage branch transactions" ON public.transactions FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage transactions" ON public.transactions FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Branch members view transactions" ON public.transactions FOR SELECT
  USING (is_member_of_branch(auth.uid(), branch_id));

-- Budgets
CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  year integer NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE),
  month integer NOT NULL, -- 1-12
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, account_id, year, month)
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Franchisees manage branch budgets" ON public.budgets FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage budgets" ON public.budgets FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Branch members view budgets" ON public.budgets FOR SELECT
  USING (is_member_of_branch(auth.uid(), branch_id));

-- Triggers for updated_at
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
