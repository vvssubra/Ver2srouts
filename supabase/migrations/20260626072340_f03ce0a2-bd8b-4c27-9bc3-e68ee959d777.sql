
-- ===== Storage: curriculum-documents =====
DROP POLICY IF EXISTS "Authenticated users can read curriculum docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload curriculum docs" ON storage.objects;

CREATE POLICY "Curriculum docs branch-scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'curriculum-documents'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

CREATE POLICY "Curriculum docs branch-scoped upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'curriculum-documents'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

CREATE POLICY "Curriculum docs branch-scoped update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'curriculum-documents'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

CREATE POLICY "Curriculum docs branch-scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'curriculum-documents'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

-- ===== Storage: expense-receipts =====
DROP POLICY IF EXISTS "Branch members upload receipts" ON storage.objects;

CREATE POLICY "Branch members upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

CREATE POLICY "Branch managers update receipts"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

DROP POLICY IF EXISTS "Admins delete receipts" ON storage.objects;
CREATE POLICY "Branch managers delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(
      auth.uid(),
      NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);

-- ===== Storage: observation-evidence =====
DROP POLICY IF EXISTS "Authenticated users can upload evidence" ON storage.objects;

-- ===== ot_audit_log: branch scoping =====
DROP POLICY IF EXISTS "Staff view own OT audit, admins view all" ON public.ot_audit_log;
DROP POLICY IF EXISTS "Authenticated insert OT audit" ON public.ot_audit_log;

CREATE POLICY "OT audit log branch-scoped read"
ON public.ot_audit_log FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.overtime_requests o
    WHERE o.id = ot_audit_log.ot_request_id
      AND (
        o.user_id = auth.uid()
        OR public.is_branch_manager(auth.uid(), o.branch_id)
      )
  )
);

CREATE POLICY "OT audit log branch-scoped insert"
ON public.ot_audit_log FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.overtime_requests o
      WHERE o.id = ot_audit_log.ot_request_id
        AND (
          o.user_id = auth.uid()
          OR public.is_branch_manager(auth.uid(), o.branch_id)
        )
    )
  )
);

-- ===== payroll_adjustments: branch scoping =====
DROP POLICY IF EXISTS "Staff view own adjustments, admins view all" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins insert payroll adjustments" ON public.payroll_adjustments;
DROP POLICY IF EXISTS "Admins update payroll adjustments" ON public.payroll_adjustments;

CREATE POLICY "Payroll adjustments branch-scoped read"
ON public.payroll_adjustments FOR SELECT TO authenticated
USING (
  staff_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
);

CREATE POLICY "Payroll adjustments branch-scoped insert"
ON public.payroll_adjustments FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
);

CREATE POLICY "Payroll adjustments branch-scoped update"
ON public.payroll_adjustments FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
);

-- ===== eform_submissions: require share_token via RPC =====
DROP POLICY IF EXISTS "Public can insert submissions for active forms" ON public.eform_submissions;

CREATE OR REPLACE FUNCTION public.submit_eform(
  p_share_token text,
  p_recipient_name text,
  p_recipient_email text,
  p_recipient_phone text,
  p_child_name text,
  p_child_level text,
  p_submitted_data jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_form public.eforms%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_share_token IS NULL OR length(p_share_token) < 8 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT * INTO v_form FROM public.eforms WHERE share_token = p_share_token AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'form not found or inactive';
  END IF;

  INSERT INTO public.eform_submissions (
    eform_id, branch_id, recipient_name, recipient_email, recipient_phone,
    child_name, child_level, status, submitted_data, submitted_at
  ) VALUES (
    v_form.id, v_form.branch_id,
    COALESCE(p_recipient_name, ''),
    COALESCE(p_recipient_email, ''),
    p_recipient_phone, p_child_name, p_child_level,
    'received', COALESCE(p_submitted_data, '{}'::jsonb), now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_eform(text, text, text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_eform(text, text, text, text, text, text, jsonb) TO anon, authenticated;
