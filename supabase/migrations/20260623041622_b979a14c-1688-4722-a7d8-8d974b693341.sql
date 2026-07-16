
-- 1. eforms: remove broad anon read; add secure token lookup RPC
DROP POLICY IF EXISTS "Public can read active eforms by token" ON public.eforms;

CREATE OR REPLACE FUNCTION public.get_eform_by_token(p_token text)
RETURNS SETOF public.eforms
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.eforms
  WHERE share_token = p_token
    AND is_active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_eform_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_eform_by_token(text) TO anon, authenticated;

-- 2. worksheets bucket: drop overly broad listing policy.
-- Files are served via getPublicUrl with URLs stored on the worksheets row,
-- so no broad list privilege is required.
DROP POLICY IF EXISTS "Authenticated list worksheets" ON storage.objects;

-- 3. audit-evidence: enforce path-scoped uploads.
-- Path convention: {branch_id}/...
DROP POLICY IF EXISTS "Authenticated upload audit evidence" ON storage.objects;
DROP POLICY IF EXISTS audit_evidence_write ON storage.objects;

CREATE POLICY audit_evidence_write
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audit-evidence'
  AND public.is_member_of_branch(
        auth.uid(),
        NULLIF((storage.foldername(name))[1], '')::uuid
      )
);

-- 4. observation-evidence: enforce path-scoped uploads.
-- Path convention: {user_id}/... (matches existing read policy semantics).
DROP POLICY IF EXISTS observation_evidence_write ON storage.objects;

CREATE POLICY observation_evidence_write
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'observation-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
