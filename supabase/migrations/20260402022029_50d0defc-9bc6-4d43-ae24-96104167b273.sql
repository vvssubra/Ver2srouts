
-- Allow staff (super_admin, franchisee, admin in same branch) to upload student photos
CREATE POLICY "Staff can upload student photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'student-photos'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id AND bm.user_id = auth.uid()
      WHERE s.id::text = (storage.foldername(name))[2]
    )
  )
);

-- Allow staff to overwrite/update student photos
CREATE POLICY "Staff can update student photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'student-photos'
  AND (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id AND bm.user_id = auth.uid()
      WHERE s.id::text = (storage.foldername(name))[2]
    )
  )
);
