-- Fix staff UPDATE RLS on overtime_requests: the existing policy only matched legacy status='pending',
-- but the app uses 'pending_approval' / 'late_pending_approval'. Result: edits were silently dropped by RLS.
DROP POLICY IF EXISTS "Staff update own pending OT requests" ON public.overtime_requests;

CREATE POLICY "Staff update own pending OT requests"
ON public.overtime_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status IN ('pending', 'pending_approval', 'late_pending_approval', 'draft', 'submitted')
)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('pending', 'pending_approval', 'late_pending_approval', 'draft', 'submitted')
);