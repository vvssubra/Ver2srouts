
-- 1) Documents table
CREATE TABLE IF NOT EXISTS public.email_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  file_url text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_documents TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.email_documents TO authenticated;
GRANT ALL ON public.email_documents TO service_role;

ALTER TABLE public.email_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read email documents"
  ON public.email_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage email documents - insert"
  ON public.email_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  );

CREATE POLICY "Admins manage email documents - update"
  ON public.email_documents FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  );

CREATE POLICY "Admins manage email documents - delete"
  ON public.email_documents FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  );

CREATE TRIGGER set_email_documents_updated_at
  BEFORE UPDATE ON public.email_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Link from template overrides to documents
ALTER TABLE public.email_template_overrides
  ADD COLUMN IF NOT EXISTS attached_document_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
