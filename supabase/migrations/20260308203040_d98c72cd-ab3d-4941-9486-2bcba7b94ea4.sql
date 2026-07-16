
-- Fee Package Groups table
CREATE TABLE public.fee_package_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_package_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view fee package groups" ON public.fee_package_groups FOR SELECT TO authenticated USING (is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Franchisees manage fee package groups" ON public.fee_package_groups FOR ALL TO authenticated USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage fee package groups" ON public.fee_package_groups FOR ALL TO authenticated USING (is_super_admin(auth.uid()));

-- Add group_id to fee_packages
ALTER TABLE public.fee_packages ADD COLUMN group_id UUID REFERENCES public.fee_package_groups(id) ON DELETE SET NULL;

-- Credit Notes table
CREATE TABLE public.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'refund',
  amount NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID,
  processed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credit_note_number TEXT NOT NULL
);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view credit notes" ON public.credit_notes FOR SELECT TO authenticated USING (is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Franchisees manage credit notes" ON public.credit_notes FOR ALL TO authenticated USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Super admins manage credit notes" ON public.credit_notes FOR ALL TO authenticated USING (is_super_admin(auth.uid()));
CREATE POLICY "Parents view own credit notes" ON public.credit_notes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM parent_students ps WHERE ps.student_id = credit_notes.student_id AND ps.parent_id = auth.uid())
);

-- Generate credit note number function
CREATE OR REPLACE FUNCTION public.generate_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year text;
  _month text;
  _seq integer;
BEGIN
  _year := to_char(CURRENT_DATE, 'YYYY');
  _month := to_char(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(NULLIF(regexp_replace(credit_note_number, '[^0-9]', '', 'g'), '') AS integer)
  ), 0) + 1 INTO _seq
  FROM credit_notes
  WHERE credit_note_number LIKE 'CN-' || _year || _month || '%';
  RETURN 'CN-' || _year || _month || '-' || lpad(_seq::text, 4, '0');
END;
$$;
