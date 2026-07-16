CREATE POLICY billing_audit_insert ON public.billing_audit_logs
FOR INSERT TO authenticated
WITH CHECK (branch_id IS NULL OR public.is_member_of_branch(auth.uid(), branch_id));