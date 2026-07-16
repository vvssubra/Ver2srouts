
-- 1. approval_requests: split requester vs manager updates
DROP POLICY IF EXISTS "Branch managers can update approval requests" ON public.approval_requests;

CREATE POLICY "Managers update approval requests"
ON public.approval_requests FOR UPDATE
USING (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id));

-- Requesters may only cancel their own pending requests (status can go to 'cancelled' only)
CREATE POLICY "Requesters can cancel own pending requests"
ON public.approval_requests FOR UPDATE
USING (requester_id = auth.uid() AND status IN ('pending','escalated'))
WITH CHECK (
  requester_id = auth.uid()
  AND status = 'cancelled'
);

-- 2. leave_requests: staff cannot change approval/status fields
DROP POLICY IF EXISTS "Staff can update own leave requests" ON public.leave_requests;

CREATE POLICY "Staff can update own pending leave requests"
ON public.leave_requests FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND level1_status IS NOT DISTINCT FROM (SELECT lr.level1_status FROM public.leave_requests lr WHERE lr.id = leave_requests.id)
  AND level2_status IS NOT DISTINCT FROM (SELECT lr.level2_status FROM public.leave_requests lr WHERE lr.id = leave_requests.id)
  AND level1_approved_by IS NOT DISTINCT FROM (SELECT lr.level1_approved_by FROM public.leave_requests lr WHERE lr.id = leave_requests.id)
  AND level2_approved_by IS NOT DISTINCT FROM (SELECT lr.level2_approved_by FROM public.leave_requests lr WHERE lr.id = leave_requests.id)
);

-- 3. staff_claims: staff cannot self-approve or mark paid
DROP POLICY IF EXISTS "Staff update own claims" ON public.staff_claims;

CREATE POLICY "Staff update own pending claims"
ON public.staff_claims FOR UPDATE
USING (auth.uid() = user_id AND status IN ('draft','pending'))
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('draft','pending')
  AND level1_status IS NOT DISTINCT FROM (SELECT sc.level1_status FROM public.staff_claims sc WHERE sc.id = staff_claims.id)
  AND level2_status IS NOT DISTINCT FROM (SELECT sc.level2_status FROM public.staff_claims sc WHERE sc.id = staff_claims.id)
);
