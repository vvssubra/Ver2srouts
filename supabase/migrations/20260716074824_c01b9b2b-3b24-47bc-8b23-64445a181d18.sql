
-- Restrict Leave and OT approvals to HR (admin) and Super Admin only.
-- Franchisees no longer see or approve other staff's leave/OT — they see only their own,
-- like regular staff. Their own requests still flow through the standard staff policies.

DROP POLICY IF EXISTS "Franchisees can view branch leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Franchisees can update branch leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Franchisees can insert branch leave requests" ON public.leave_requests;

DROP POLICY IF EXISTS "Franchisees view branch OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Franchisees update branch OT requests" ON public.overtime_requests;
