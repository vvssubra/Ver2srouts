
CREATE POLICY "School docs: staff manage"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'school-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.branch_memberships bm
        WHERE bm.user_id = auth.uid()
          AND bm.branch_id::text = split_part(name, '/', 1)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'school-documents'
    AND (
      public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.branch_memberships bm
        WHERE bm.user_id = auth.uid()
          AND bm.branch_id::text = split_part(name, '/', 1)
      )
    )
  );

CREATE POLICY "School docs: parents in branch read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-documents'
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      WHERE ps.parent_id = auth.uid()
        AND ps.status = 'approved'
        AND s.branch_id::text = split_part(name, '/', 1)
    )
  );
