CREATE POLICY "Parents can read their child's class"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.parent_students ps ON ps.student_id = s.id
      WHERE s.class_id = classes.id
        AND ps.parent_id = auth.uid()
        AND ps.status = 'approved'
    )
  );