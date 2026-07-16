
-- Create audit_question_category enum
CREATE TYPE public.audit_question_category AS ENUM ('health_safety', 'teacher_quality', 'curriculum_standards', 'facility', 'general');

-- Create audit_templates table
CREATE TABLE public.audit_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage audit templates" ON public.audit_templates FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Authenticated read audit templates" ON public.audit_templates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_audit_templates_updated_at BEFORE UPDATE ON public.audit_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit_questions table
CREATE TABLE public.audit_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.audit_templates(id) ON DELETE CASCADE,
  category public.audit_question_category NOT NULL DEFAULT 'general',
  question_text TEXT NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage audit questions" ON public.audit_questions FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Authenticated read audit questions" ON public.audit_questions FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- Create branch_audits table
CREATE TABLE public.branch_audits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  auditor_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.audit_templates(id),
  status TEXT NOT NULL DEFAULT 'in_progress',
  total_score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.branch_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage branch audits" ON public.branch_audits FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Franchisees view own branch audits" ON public.branch_audits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'franchisee') AND public.is_member_of_branch(auth.uid(), branch_id));
CREATE POLICY "Auditor manages own audits" ON public.branch_audits FOR ALL TO authenticated USING (auth.uid() = auditor_id);

-- Create audit_responses table
CREATE TABLE public.audit_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID NOT NULL REFERENCES public.branch_audits(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.audit_questions(id),
  status TEXT NOT NULL DEFAULT 'na',
  auditor_notes TEXT,
  photo_evidence_url TEXT,
  corrective_action TEXT,
  corrective_proof_url TEXT,
  corrective_status TEXT NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage audit responses" ON public.audit_responses FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Auditor manages own audit responses" ON public.audit_responses FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.branch_audits ba WHERE ba.id = audit_responses.audit_id AND ba.auditor_id = auth.uid()));
CREATE POLICY "Franchisees view own branch audit responses" ON public.audit_responses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.branch_audits ba WHERE ba.id = audit_responses.audit_id AND public.has_role(auth.uid(), 'franchisee') AND public.is_member_of_branch(auth.uid(), ba.branch_id)));
CREATE POLICY "Franchisees update corrective fields" ON public.audit_responses FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.branch_audits ba WHERE ba.id = audit_responses.audit_id AND public.has_role(auth.uid(), 'franchisee') AND public.is_member_of_branch(auth.uid(), ba.branch_id)));

-- Storage bucket for audit evidence
INSERT INTO storage.buckets (id, name, public) VALUES ('audit-evidence', 'audit-evidence', true);

CREATE POLICY "Authenticated upload audit evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audit-evidence');
CREATE POLICY "Public read audit evidence" ON storage.objects FOR SELECT USING (bucket_id = 'audit-evidence');
