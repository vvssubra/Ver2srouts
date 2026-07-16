
-- 1. Expand leave_type enum
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'compassionate';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'replacement';

-- 2. Create staff_claims table
CREATE TABLE public.staff_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  claim_type text NOT NULL DEFAULT 'other',
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  receipt_url text,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending',
  level1_approved_by uuid,
  level1_approved_at timestamptz,
  level1_status text NOT NULL DEFAULT 'pending',
  level1_notes text,
  level2_approved_by uuid,
  level2_approved_at timestamptz,
  level2_status text NOT NULL DEFAULT 'pending',
  level2_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own claims" ON public.staff_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Staff insert own claims" ON public.staff_claims FOR INSERT WITH CHECK (auth.uid() = user_id AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Staff update own claims" ON public.staff_claims FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Franchisees view branch claims" ON public.staff_claims FOR SELECT USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Franchisees update branch claims" ON public.staff_claims FOR UPDATE USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage claims" ON public.staff_claims FOR ALL USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_staff_claims_updated_at BEFORE UPDATE ON public.staff_claims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create staff_designations table
CREATE TABLE public.staff_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  designation text NOT NULL DEFAULT 'teacher',
  custom_designation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

ALTER TABLE public.staff_designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own designation" ON public.staff_designations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Franchisees manage branch designations" ON public.staff_designations FOR ALL USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage designations" ON public.staff_designations FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Authenticated view designations" ON public.staff_designations FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_staff_designations_updated_at BEFORE UPDATE ON public.staff_designations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Alter leave_requests - add attachment_url
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachment_url text;

-- 5. Alter leave_balances - add compassionate and replacement
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS compassionate_total integer NOT NULL DEFAULT 3;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS compassionate_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS replacement_total integer NOT NULL DEFAULT 0;
ALTER TABLE public.leave_balances ADD COLUMN IF NOT EXISTS replacement_used integer NOT NULL DEFAULT 0;

-- 6. Alter staff_profiles - add custom statutory rates
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS custom_epf_rate numeric;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS custom_socso_rate numeric;
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS custom_eis_rate numeric;

-- 7. Alter payroll_records - add claims_amount
ALTER TABLE public.payroll_records ADD COLUMN IF NOT EXISTS claims_amount numeric NOT NULL DEFAULT 0;

-- 8. Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-claims', 'staff-claims', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('leave-attachments', 'leave-attachments', true) ON CONFLICT (id) DO NOTHING;

-- 9. Storage RLS policies
CREATE POLICY "Authenticated upload claim receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'staff-claims' AND auth.uid() IS NOT NULL);
CREATE POLICY "Public read claim receipts" ON storage.objects FOR SELECT USING (bucket_id = 'staff-claims');
CREATE POLICY "Authenticated upload leave attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'leave-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "Public read leave attachments" ON storage.objects FOR SELECT USING (bucket_id = 'leave-attachments');
