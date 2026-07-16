
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  heading TEXT NOT NULL,
  body_html TEXT NOT NULL,
  cta_text TEXT,
  cta_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, template_type)
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view email templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage email templates"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage email templates"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
