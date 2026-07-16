
-- =========================================================
-- 1. STORAGE: audit-evidence, observation-evidence, expense-receipts
--    Require branch-scoped access (or super admin).
-- =========================================================

DROP POLICY IF EXISTS "audit_evidence_read" ON storage.objects;
CREATE POLICY "audit_evidence_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'audit-evidence' AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
         auth.uid(),
         NULLIF((storage.foldername(name))[1], '')::uuid
       )
  )
);

DROP POLICY IF EXISTS "observation_evidence_read" ON storage.objects;
CREATE POLICY "observation_evidence_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'observation-evidence' AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.branch_memberships bm_viewer
      JOIN public.branch_memberships bm_owner
        ON bm_owner.branch_id = bm_viewer.branch_id
      WHERE bm_viewer.user_id = auth.uid()
        AND bm_owner.user_id = NULLIF((storage.foldername(name))[1], '')::uuid
    )
  )
);
-- Note: parents continue to view observation images via signed URLs which
-- bypass storage RLS, so this restriction does not affect the parent app.

DROP POLICY IF EXISTS "Branch members view receipts" ON storage.objects;
CREATE POLICY "Branch members view receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-receipts' AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
         auth.uid(),
         NULLIF((storage.foldername(name))[1], '')::uuid
       )
  )
);

-- =========================================================
-- 2. STORAGE: stop public buckets from being browsable via the list API.
--    The public CDN (storage/v1/object/public/...) bypasses RLS, so direct
--    file fetches still work.
-- =========================================================

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Admins list avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'avatars' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Branding files are publicly viewable" ON storage.objects;
CREATE POLICY "Admins list branding"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'branding' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "view_learning_media" ON storage.objects;
CREATE POLICY "Branch members list learning media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'learning-media' AND (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(
         auth.uid(),
         NULLIF((storage.foldername(name))[1], '')::uuid
       )
  )
);

DROP POLICY IF EXISTS "Anyone can view newsletter assets" ON storage.objects;
CREATE POLICY "Admins list newsletter assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'newsletter-assets' AND public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view worksheets" ON storage.objects;
CREATE POLICY "Authenticated list worksheets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'worksheets');

-- =========================================================
-- 3. branch_events: restrict SELECT to branch members.
-- =========================================================

DROP POLICY IF EXISTS "Users can view branch events" ON public.branch_events;
CREATE POLICY "Branch members can view branch events"
ON public.branch_events FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_member_of_branch(auth.uid(), branch_id)
);

-- =========================================================
-- 4. gateway_events / gateway_transactions: service-role only INSERT.
-- =========================================================

DROP POLICY IF EXISTS "Service can insert gateway events" ON public.gateway_events;
CREATE POLICY "Service role inserts gateway events"
ON public.gateway_events FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service can insert gateway transactions" ON public.gateway_transactions;
CREATE POLICY "Service role inserts gateway transactions"
ON public.gateway_transactions FOR INSERT
TO service_role
WITH CHECK (true);

-- =========================================================
-- 5. notifications: only self, staff, or service role can insert.
-- =========================================================

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Self or staff insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin','franchisee','admin','teacher','staff')
  )
);

CREATE POLICY "Service role inserts notifications"
ON public.notifications FOR INSERT
TO service_role
WITH CHECK (true);

-- =========================================================
-- 6. parent_feed_notifications: only staff of the journey entry's branch.
-- =========================================================

DROP POLICY IF EXISTS "Staff can insert feed notifications" ON public.parent_feed_notifications;
CREATE POLICY "Staff in branch insert feed notifications"
ON public.parent_feed_notifications FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.daily_learning_journey_entries e
    JOIN public.classes c ON c.id = e.class_id
    WHERE e.id = journey_entry_id
      AND public.is_member_of_branch(auth.uid(), c.branch_id)
  )
);

CREATE POLICY "Service role inserts feed notifications"
ON public.parent_feed_notifications FOR INSERT
TO service_role
WITH CHECK (true);

-- =========================================================
-- 7. Other always-true insert policies flagged by the linter.
-- =========================================================

DROP POLICY IF EXISTS "Service role insert email logs" ON public.email_logs;
CREATE POLICY "Service role insert email logs"
ON public.email_logs FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Public can insert submissions" ON public.eform_submissions;
CREATE POLICY "Public can insert submissions for active forms"
ON public.eform_submissions FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.eforms f
    WHERE f.id = eform_id
      AND f.branch_id = eform_submissions.branch_id
      AND f.is_active = true
  )
);

-- =========================================================
-- 8. Functions: pin search_path.
-- =========================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, extensions
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;
