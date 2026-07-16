
CREATE OR REPLACE FUNCTION public.is_student_in_user_branch(_user_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM students s
    JOIN branch_memberships bm ON bm.branch_id = s.branch_id
    WHERE s.id = _student_id AND bm.user_id = _user_id
  )
$$;

DROP POLICY "Staff can manage parent-student links" ON parent_students;
CREATE POLICY "Staff can manage parent-student links"
  ON parent_students FOR ALL TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR is_student_in_user_branch(auth.uid(), student_id)
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR is_student_in_user_branch(auth.uid(), student_id)
  );
