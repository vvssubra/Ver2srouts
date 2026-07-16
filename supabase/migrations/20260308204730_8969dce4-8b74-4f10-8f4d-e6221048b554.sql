
CREATE TABLE public.branch_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL UNIQUE REFERENCES public.branches(id) ON DELETE CASCADE,
  logo_url TEXT,
  school_display_name TEXT,
  business_registration_no TEXT,
  address_line TEXT,
  phone TEXT,
  email TEXT,
  invoice_terms TEXT,
  invoice_notes TEXT,
  receipt_footer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branch_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view branch settings" ON public.branch_settings
  FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage branch settings" ON public.branch_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage branch settings" ON public.branch_settings
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));
