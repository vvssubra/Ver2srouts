
-- 1. Alter staff_profiles to add onboarding fields
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS marital_status text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_token uuid,
  ADD COLUMN IF NOT EXISTS onboarding_token_expires_at timestamptz;

-- 2. Create staff_documents table
CREATE TABLE public.staff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

-- Staff view own documents
CREATE POLICY "Staff view own documents"
ON public.staff_documents FOR SELECT
USING (auth.uid() = user_id);

-- Staff insert own documents
CREATE POLICY "Staff insert own documents"
ON public.staff_documents FOR INSERT
WITH CHECK (auth.uid() = user_id AND auth.uid() = uploaded_by);

-- Franchisees view branch staff documents
CREATE POLICY "Franchisees view branch staff documents"
ON public.staff_documents FOR SELECT
USING (
  has_role(auth.uid(), 'franchisee'::app_role) AND
  EXISTS (
    SELECT 1 FROM branch_memberships bm1
    JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_documents.user_id
  )
);

-- Franchisees manage branch staff documents
CREATE POLICY "Franchisees manage branch staff documents"
ON public.staff_documents FOR ALL
USING (
  has_role(auth.uid(), 'franchisee'::app_role) AND
  EXISTS (
    SELECT 1 FROM branch_memberships bm1
    JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_documents.user_id
  )
);

-- Super admins manage all documents
CREATE POLICY "Super admins manage all staff documents"
ON public.staff_documents FOR ALL
USING (is_super_admin(auth.uid()));

-- 3. Create storage bucket for staff documents
INSERT INTO storage.buckets (id, name, public) VALUES ('staff-documents', 'staff-documents', true);

-- Storage policies for staff-documents bucket
CREATE POLICY "Staff upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'staff-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Staff view own documents storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins view all staff documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'staff-documents' AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'franchisee'::app_role)));

CREATE POLICY "Admins manage all staff documents"
ON storage.objects FOR ALL
USING (bucket_id = 'staff-documents' AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'franchisee'::app_role)));

-- Franchisees can update staff_profiles for branch members
CREATE POLICY "Franchisees can update branch staff profiles"
ON public.staff_profiles FOR UPDATE
USING (
  has_role(auth.uid(), 'franchisee'::app_role) AND
  EXISTS (
    SELECT 1 FROM branch_memberships bm1
    JOIN branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_profiles.user_id
  )
);
