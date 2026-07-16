-- 1. Fix RLS: Add admin policy for payroll_records
CREATE POLICY "Admins can manage branch payroll"
ON public.payroll_records
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND is_member_of_branch(auth.uid(), branch_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND is_member_of_branch(auth.uid(), branch_id)
);

-- 2. Add reversal columns to payroll_records
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

-- 3. Create payroll_custom_items table
CREATE TABLE IF NOT EXISTS public.payroll_custom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_record_id uuid NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'earning',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payroll_custom_items ENABLE ROW LEVEL SECURITY;

-- RLS for payroll_custom_items: same access as payroll_records
CREATE POLICY "Super admins manage all custom items"
ON public.payroll_custom_items
FOR ALL TO authenticated
USING (
  is_super_admin(auth.uid())
);

CREATE POLICY "Franchisees can manage branch custom items"
ON public.payroll_custom_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payroll_records pr
    WHERE pr.id = payroll_custom_items.payroll_record_id
    AND has_role(auth.uid(), 'franchisee'::app_role)
    AND is_member_of_branch(auth.uid(), pr.branch_id)
  )
);

CREATE POLICY "Admins can manage branch custom items"
ON public.payroll_custom_items
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payroll_records pr
    WHERE pr.id = payroll_custom_items.payroll_record_id
    AND has_role(auth.uid(), 'admin'::app_role)
    AND is_member_of_branch(auth.uid(), pr.branch_id)
  )
);

CREATE POLICY "Staff can view own custom items"
ON public.payroll_custom_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payroll_records pr
    WHERE pr.id = payroll_custom_items.payroll_record_id
    AND pr.user_id = auth.uid()
  )
);