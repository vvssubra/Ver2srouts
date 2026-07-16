
-- 1. billing_audit_logs: restrict INSERT to managers/service role
DROP POLICY IF EXISTS billing_audit_insert ON public.billing_audit_logs;
CREATE POLICY billing_audit_insert ON public.billing_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    branch_id IS NULL
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_super_admin(auth.uid())
  );

-- 2. email_global_settings: restrict to super_admin only
DROP POLICY IF EXISTS "Admins manage email settings" ON public.email_global_settings;
CREATE POLICY "Super admins manage email settings" ON public.email_global_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 3. eform_submissions: allow anonymous INSERT for active eforms (public enrollment)
CREATE POLICY "Anonymous can submit active eforms" ON public.eform_submissions
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.eforms e
      WHERE e.id = eform_submissions.eform_id
        AND e.is_active = true
        AND e.branch_id = eform_submissions.branch_id
    )
  );
GRANT INSERT ON public.eform_submissions TO anon;

-- 4. notifications: restrict insert to self or service/super_admin (no cross-user staff insert)
DROP POLICY IF EXISTS "Self or staff insert notifications" ON public.notifications;
CREATE POLICY "Self insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
  );

-- 5. payment_allocations: restrict insert to branch managers / super admins
DROP POLICY IF EXISTS "Managers can insert allocations" ON public.payment_allocations;
CREATE POLICY "Managers can insert allocations" ON public.payment_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_super_admin(auth.uid())
  );
