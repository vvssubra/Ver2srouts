
-- 1. Create staff_salary_components table
CREATE TABLE public.staff_salary_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  type text NOT NULL DEFAULT 'earning',
  amount numeric NOT NULL DEFAULT 0,
  is_statutory boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.staff_salary_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage salary components"
ON public.staff_salary_components FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers can manage salary components for their staff"
ON public.staff_salary_components FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.branch_memberships bm1
    JOIN public.branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_salary_components.user_id
    AND (public.has_role(auth.uid(), 'franchisee') OR public.has_role(auth.uid(), 'admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branch_memberships bm1
    JOIN public.branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_salary_components.user_id
    AND (public.has_role(auth.uid(), 'franchisee') OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Staff can view their own salary components"
ON public.staff_salary_components FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2. Add payroll approval column to approval_settings
ALTER TABLE public.approval_settings
  ADD COLUMN payroll_l2_enabled boolean NOT NULL DEFAULT false;

-- 3. Add approval tracking columns to payroll_records
ALTER TABLE public.payroll_records
  ADD COLUMN submitted_by uuid REFERENCES auth.users(id),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz;
