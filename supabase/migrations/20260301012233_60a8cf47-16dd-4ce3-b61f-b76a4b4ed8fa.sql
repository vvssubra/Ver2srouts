
-- Students table (per branch)
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Branch members can view students in their branch
CREATE POLICY "Branch members can view students"
ON public.students FOR SELECT
TO authenticated
USING (is_member_of_branch(auth.uid(), branch_id));

-- Teachers/franchisees can insert students in their branch
CREATE POLICY "Branch members can insert students"
ON public.students FOR INSERT
TO authenticated
WITH CHECK (is_member_of_branch(auth.uid(), branch_id));

-- Teachers/franchisees can update students in their branch
CREATE POLICY "Branch members can update students"
ON public.students FOR UPDATE
TO authenticated
USING (is_member_of_branch(auth.uid(), branch_id));

-- Super admins manage all students
CREATE POLICY "Super admins manage all students"
ON public.students FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Proficiency level enum
CREATE TYPE public.proficiency_level AS ENUM ('TP1', 'TP2', 'TP3');

-- Observations table
CREATE TABLE public.student_observations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  standard_id UUID NOT NULL REFERENCES public.curriculum_standards(id) ON DELETE CASCADE,
  proficiency_level public.proficiency_level NOT NULL,
  notes TEXT,
  evidence_url TEXT,
  observed_by UUID NOT NULL,
  observed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.student_observations ENABLE ROW LEVEL SECURITY;

-- Teachers can view observations for students in their branch
CREATE POLICY "Branch members can view observations"
ON public.student_observations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_observations.student_id
    AND is_member_of_branch(auth.uid(), s.branch_id)
  )
);

-- Teachers can insert observations
CREATE POLICY "Teachers can insert observations"
ON public.student_observations FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = observed_by
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_observations.student_id
    AND is_member_of_branch(auth.uid(), s.branch_id)
  )
);

-- Teachers can update their own observations
CREATE POLICY "Teachers can update own observations"
ON public.student_observations FOR UPDATE
TO authenticated
USING (auth.uid() = observed_by);

-- Teachers can delete their own observations
CREATE POLICY "Teachers can delete own observations"
ON public.student_observations FOR DELETE
TO authenticated
USING (auth.uid() = observed_by);

-- Super admins manage all observations
CREATE POLICY "Super admins manage all observations"
ON public.student_observations FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_observations_updated_at
BEFORE UPDATE ON public.student_observations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for observation evidence
INSERT INTO storage.buckets (id, name, public) VALUES ('observation-evidence', 'observation-evidence', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload evidence"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'observation-evidence');

CREATE POLICY "Anyone can view evidence"
ON storage.objects FOR SELECT
USING (bucket_id = 'observation-evidence');

CREATE POLICY "Users can delete their own evidence"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'observation-evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
