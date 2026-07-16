-- Allow staff to delete (cancel) their own still-pending OT requests.
CREATE POLICY "Staff delete own pending OT requests"
ON public.overtime_requests
FOR DELETE
USING (
  auth.uid() = user_id
  AND status = ANY (ARRAY['pending'::text,'pending_approval'::text,'late_pending_approval'::text,'draft'::text,'submitted'::text])
);