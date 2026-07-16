
DROP POLICY IF EXISTS "Self insert notifications" ON public.notifications;
CREATE POLICY "Insert notifications self or same branch" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.branch_memberships me
      JOIN public.branch_memberships them ON them.branch_id = me.branch_id
      WHERE me.user_id = auth.uid()
        AND them.user_id = notifications.user_id
    )
  );
