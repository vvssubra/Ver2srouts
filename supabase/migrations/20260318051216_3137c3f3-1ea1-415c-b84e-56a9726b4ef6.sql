
-- Allow branch managers and super admins to upload branch logos to avatars bucket
CREATE POLICY "Branch managers can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'branch-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), ((storage.foldername(name))[2])::uuid)
  )
);

-- Allow branch managers and super admins to update branch logos
CREATE POLICY "Branch managers can update logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'branch-logos'
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), ((storage.foldername(name))[2])::uuid)
  )
);
