
-- ═══════════════════════════════════════════════════════════════
-- MODULE D ENHANCEMENT: Staff Profiles & Enhanced Payroll
-- ═══════════════════════════════════════════════════════════════

-- Staff profiles for HR data (IC, bank, tax, employment)
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  ic_number text,
  tax_number text,
  epf_number text,
  socso_number text,
  eis_number text,
  bank_name text,
  bank_account text,
  basic_salary numeric DEFAULT 0,
  employment_type text DEFAULT 'full_time', -- full_time, part_time, contract
  employment_start_date date,
  employment_end_date date,
  is_active boolean DEFAULT true,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Staff can view own profile
CREATE POLICY "Staff can view own staff profile"
  ON public.staff_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Staff can update own profile
CREATE POLICY "Staff can update own staff profile"
  ON public.staff_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Franchisees can view branch staff profiles
CREATE POLICY "Franchisees can view branch staff profiles"
  ON public.staff_profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'franchisee') AND
    EXISTS (
      SELECT 1 FROM branch_memberships bm1
      JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
      WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_profiles.user_id
    )
  );

-- Super admins manage all
CREATE POLICY "Super admins manage staff profiles"
  ON public.staff_profiles FOR ALL
  USING (is_super_admin(auth.uid()));

-- Franchisees can insert staff profiles for branch members
CREATE POLICY "Franchisees can insert staff profiles"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'franchisee') AND
    EXISTS (
      SELECT 1 FROM branch_memberships bm1
      JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
      WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_profiles.user_id
    )
  );

-- Staff can insert own profile
CREATE POLICY "Staff can insert own staff profile"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update trigger
CREATE TRIGGER update_staff_profiles_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- ENHANCED PAYROLL: Add overtime, deductions, advances columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS overtime_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_deduction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deductions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deduction_notes text,
  ADD COLUMN IF NOT EXISTS other_allowances numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowance_notes text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft', -- draft, confirmed, paid
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ═══════════════════════════════════════════════════════════════
-- MODULE E: BILLING & INVOICING
-- ═══════════════════════════════════════════════════════════════

-- Fee packages (tuition, meals, transport, etc.)
CREATE TABLE public.fee_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  name text NOT NULL,
  description text,
  fee_type text NOT NULL DEFAULT 'monthly', -- monthly, one_time, term
  amount numeric NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view fee packages"
  ON public.fee_packages FOR SELECT
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage branch fee packages"
  ON public.fee_packages FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage fee packages"
  ON public.fee_packages FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_fee_packages_updated_at
  BEFORE UPDATE ON public.fee_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Student fee assignments (which student pays which fees)
CREATE TABLE public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  fee_package_id uuid NOT NULL REFERENCES fee_packages(id),
  discount_amount numeric DEFAULT 0,
  discount_reason text,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view student fees"
  ON public.student_fees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_fees.student_id AND is_member_of_branch(auth.uid(), s.branch_id)
  ));

CREATE POLICY "Parents view own children fees"
  ON public.student_fees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM parent_students ps WHERE ps.student_id = student_fees.student_id AND ps.parent_id = auth.uid()
  ));

CREATE POLICY "Franchisees manage student fees"
  ON public.student_fees FOR ALL
  USING (EXISTS (
    SELECT 1 FROM students s WHERE s.id = student_fees.student_id
    AND has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), s.branch_id)
  ));

CREATE POLICY "Super admins manage student fees"
  ON public.student_fees FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_student_fees_updated_at
  BEFORE UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoices
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  branch_id uuid NOT NULL REFERENCES branches(id),
  student_id uuid NOT NULL REFERENCES students(id),
  billing_month integer NOT NULL,
  billing_year integer NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft', -- draft, issued, paid, partial, overdue, cancelled
  due_date date NOT NULL,
  issued_at timestamptz,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view invoices"
  ON public.invoices FOR SELECT
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Parents view own children invoices"
  ON public.invoices FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM parent_students ps WHERE ps.student_id = invoices.student_id AND ps.parent_id = auth.uid()
  ));

CREATE POLICY "Franchisees manage branch invoices"
  ON public.invoices FOR ALL
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage invoices"
  ON public.invoices FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice line items
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  fee_package_id uuid REFERENCES fee_packages(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoice items follow invoice access"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND is_member_of_branch(auth.uid(), i.branch_id)
  ));

CREATE POLICY "Parents view own invoice items"
  ON public.invoice_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN parent_students ps ON ps.student_id = i.student_id
    WHERE i.id = invoice_items.invoice_id AND ps.parent_id = auth.uid()
  ));

CREATE POLICY "Franchisees manage invoice items"
  ON public.invoice_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id
    AND has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), i.branch_id)
  ));

CREATE POLICY "Super admins manage invoice items"
  ON public.invoice_items FOR ALL
  USING (is_super_admin(auth.uid()));

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash', -- cash, bank_transfer, online, cheque
  payment_reference text,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  received_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view payments"
  ON public.payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id AND is_member_of_branch(auth.uid(), i.branch_id)
  ));

CREATE POLICY "Parents view own payments"
  ON public.payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM invoices i
    JOIN parent_students ps ON ps.student_id = i.student_id
    WHERE i.id = payments.invoice_id AND ps.parent_id = auth.uid()
  ));

CREATE POLICY "Franchisees manage payments"
  ON public.payments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM invoices i WHERE i.id = payments.invoice_id
    AND has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), i.branch_id)
  ));

CREATE POLICY "Super admins manage payments"
  ON public.payments FOR ALL
  USING (is_super_admin(auth.uid()));

-- Invoice number sequence function
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year text;
  _month text;
  _seq integer;
  _number text;
BEGIN
  _year := to_char(CURRENT_DATE, 'YYYY');
  _month := to_char(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(invoice_number, '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1 INTO _seq
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || _year || _month || '%';
  _number := 'INV-' || _year || _month || '-' || lpad(_seq::text, 4, '0');
  RETURN _number;
END;
$$;
