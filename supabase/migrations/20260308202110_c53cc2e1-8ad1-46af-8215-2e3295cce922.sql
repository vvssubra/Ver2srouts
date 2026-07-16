
-- Allow teachers to delete announcements they created
CREATE POLICY "Teachers delete own announcements"
ON public.announcements
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid() AND has_role(auth.uid(), 'teacher'::app_role)
);

-- Allow franchisees to delete branch announcements
CREATE POLICY "Franchisees delete branch announcements"
ON public.announcements
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id)
);

-- Super admins already have ALL policy

-- Also delete related announcement_reads and notifications when announcement is deleted
