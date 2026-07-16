
-- Drop old public-read policies for these buckets
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (
        policyname ILIKE 'Public%' OR
        policyname ILIKE 'Anyone can view evidence' OR
        policyname ILIKE 'Public read%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Helper-free authenticated read policies per bucket
-- staff-documents: owner (folder = uid) OR admin/franchisee/super_admin in same branch as owner
DROP POLICY IF EXISTS "staff_documents_read" ON storage.objects;
CREATE POLICY "staff_documents_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.branch_memberships bm
      JOIN public.user_roles ur ON ur.user_id = bm.user_id
      WHERE bm.user_id = auth.uid()
        AND ur.role IN ('admin','franchisee','super_admin')
        AND bm.branch_id IN (
          SELECT branch_id FROM public.branch_memberships
          WHERE user_id::text = (storage.foldername(name))[1]
        )
    )
  )
);

DROP POLICY IF EXISTS "staff_documents_write" ON storage.objects;
CREATE POLICY "staff_documents_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  )
);

DROP POLICY IF EXISTS "staff_documents_delete" ON storage.objects;
CREATE POLICY "staff_documents_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'staff-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  )
);

-- staff-claims: owner or branch admin/franchisee
DROP POLICY IF EXISTS "staff_claims_read" ON storage.objects;
CREATE POLICY "staff_claims_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-claims' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  )
);
DROP POLICY IF EXISTS "staff_claims_write" ON storage.objects;
CREATE POLICY "staff_claims_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-claims' AND auth.uid()::text = (storage.foldername(name))[1]
);
DROP POLICY IF EXISTS "staff_claims_delete" ON storage.objects;
CREATE POLICY "staff_claims_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'staff-claims' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- leave-attachments: same pattern (owner or branch approver)
DROP POLICY IF EXISTS "leave_attachments_read" ON storage.objects;
CREATE POLICY "leave_attachments_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leave-attachments' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  )
);
DROP POLICY IF EXISTS "leave_attachments_write" ON storage.objects;
CREATE POLICY "leave_attachments_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'leave-attachments' AND auth.uid()::text = (storage.foldername(name))[1]
);
DROP POLICY IF EXISTS "leave_attachments_delete" ON storage.objects;
CREATE POLICY "leave_attachments_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'leave-attachments' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- audit-evidence: any authenticated staff (branch members + super_admin)
DROP POLICY IF EXISTS "audit_evidence_read" ON storage.objects;
CREATE POLICY "audit_evidence_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'audit-evidence' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.branch_memberships WHERE user_id = auth.uid())
  )
);
DROP POLICY IF EXISTS "audit_evidence_write" ON storage.objects;
CREATE POLICY "audit_evidence_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'audit-evidence' AND EXISTS (
    SELECT 1 FROM public.branch_memberships WHERE user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "audit_evidence_delete" ON storage.objects;
CREATE POLICY "audit_evidence_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audit-evidence' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'franchisee')
    OR public.has_role(auth.uid(), 'admin')
  )
);

-- observation-evidence: branch staff OR parents of approved students
DROP POLICY IF EXISTS "observation_evidence_read" ON storage.objects;
CREATE POLICY "observation_evidence_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'observation-evidence' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.branch_memberships WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.parent_students
      WHERE parent_id = auth.uid() AND status = 'approved'
    )
  )
);
DROP POLICY IF EXISTS "observation_evidence_write" ON storage.objects;
CREATE POLICY "observation_evidence_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'observation-evidence' AND EXISTS (
    SELECT 1 FROM public.branch_memberships WHERE user_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "observation_evidence_delete" ON storage.objects;
CREATE POLICY "observation_evidence_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'observation-evidence' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'franchisee')
  )
);
