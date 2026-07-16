
-- Create attendance status enum
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

-- Create attendance table
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status public.attendance_status NOT NULL DEFAULT 'present',
  notes text,
  marked_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Branch members can view attendance for their branch
CREATE POLICY "Branch members can view attendance"
  ON public.attendance FOR SELECT
  USING (public.is_member_of_branch(auth.uid(), branch_id));

-- Branch members can insert attendance
CREATE POLICY "Branch members can insert attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (
    auth.uid() = marked_by
    AND public.is_member_of_branch(auth.uid(), branch_id)
  );

-- Branch members can update attendance they marked
CREATE POLICY "Branch members can update attendance"
  ON public.attendance FOR UPDATE
  USING (
    auth.uid() = marked_by
    AND public.is_member_of_branch(auth.uid(), branch_id)
  );

-- Super admins manage all attendance
CREATE POLICY "Super admins manage all attendance"
  ON public.attendance FOR ALL
  USING (public.is_super_admin(auth.uid()));

-- Parents can view their children's attendance
CREATE POLICY "Parents can view children attendance"
  ON public.attendance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.student_id = attendance.student_id
        AND ps.parent_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
