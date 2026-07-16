
DROP POLICY IF EXISTS upload_learning_media ON storage.objects;
DROP POLICY IF EXISTS delete_learning_media ON storage.objects;

CREATE POLICY upload_learning_media
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'learning-media'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_member_of_branch(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY delete_learning_media
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'learning-media'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_member_of_branch(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );
