
-- Link parents to students
CREATE TABLE public.parent_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

-- Parents can view their own links
CREATE POLICY "Parents can view own children"
ON public.parent_students FOR SELECT
TO authenticated
USING (auth.uid() = parent_id);

-- Super admins + franchisees + teachers can manage links
CREATE POLICY "Staff can manage parent-student links"
ON public.parent_students FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = parent_students.student_id
    AND is_member_of_branch(auth.uid(), s.branch_id)
  )
);

-- Allow parents to view their children's student records
CREATE POLICY "Parents can view their children"
ON public.students FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = students.id
    AND ps.parent_id = auth.uid()
  )
);

-- Allow parents to view observations for their children
CREATE POLICY "Parents can view their children observations"
ON public.student_observations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = student_observations.student_id
    AND ps.parent_id = auth.uid()
  )
);
