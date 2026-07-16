
-- Helper: check whether the caller shares a branch membership with the folder owner (folder = uid)
-- Uses branch_memberships table directly, matching existing patterns.

-- ============ staff-documents ============
DROP POLICY IF EXISTS "Admins manage all staff documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins view all staff documents" ON storage.objects;

DROP POLICY IF EXISTS "staff_documents_write" ON storage.objects;
CREATE POLICY "staff_documents_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'staff-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franchisee'))
      AND EXISTS (
        SELECT 1 FROM public.branch_memberships bm_self
        JOIN public.branch_memberships bm_owner ON bm_owner.branch_id = bm_self.branch_id
        WHERE bm_self.user_id = auth.uid()
          AND bm_owner.user_id::text = (storage.foldername(name))[1]
      )
    )
  )
);

DROP POLICY IF EXISTS "staff_documents_delete" ON storage.objects;
CREATE POLICY "staff_documents_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'staff-documents' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franchisee'))
      AND EXISTS (
        SELECT 1 FROM public.branch_memberships bm_self
        JOIN public.branch_memberships bm_owner ON bm_owner.branch_id = bm_self.branch_id
        WHERE bm_self.user_id = auth.uid()
          AND bm_owner.user_id::text = (storage.foldername(name))[1]
      )
    )
  )
);

-- ============ staff-claims ============
DROP POLICY IF EXISTS "staff_claims_read" ON storage.objects;
CREATE POLICY "staff_claims_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'staff-claims' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franchisee'))
      AND EXISTS (
        SELECT 1 FROM public.branch_memberships bm_self
        JOIN public.branch_memberships bm_owner ON bm_owner.branch_id = bm_self.branch_id
        WHERE bm_self.user_id = auth.uid()
          AND bm_owner.user_id::text = (storage.foldername(name))[1]
      )
    )
  )
);

-- ============ leave-attachments ============
DROP POLICY IF EXISTS "leave_attachments_read" ON storage.objects;
CREATE POLICY "leave_attachments_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leave-attachments' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franchisee'))
      AND EXISTS (
        SELECT 1 FROM public.branch_memberships bm_self
        JOIN public.branch_memberships bm_owner ON bm_owner.branch_id = bm_self.branch_id
        WHERE bm_self.user_id = auth.uid()
          AND bm_owner.user_id::text = (storage.foldername(name))[1]
      )
    )
  )
);

-- ============ audit-evidence (DELETE only) ============
-- Folder convention for audit-evidence uses the caller's branch_id as (foldername)[1].
DROP POLICY IF EXISTS "audit_evidence_delete" ON storage.objects;
CREATE POLICY "audit_evidence_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'audit-evidence' AND (
    public.has_role(auth.uid(), 'super_admin')
    OR (
      (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'franchisee'))
      AND EXISTS (
        SELECT 1 FROM public.branch_memberships bm
        WHERE bm.user_id = auth.uid()
          AND bm.branch_id::text = (storage.foldername(name))[1]
      )
    )
  )
);
