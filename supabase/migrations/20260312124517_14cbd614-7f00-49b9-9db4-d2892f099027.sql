
-- Table: class_coverage_logs (AI memory of what a class has covered)
CREATE TABLE public.class_coverage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  subject_name text NOT NULL,
  standard_code text NOT NULL,
  week_starting date NOT NULL,
  lesson_plan_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coverage_class_subject ON public.class_coverage_logs(class_id, subject_name);
CREATE INDEX idx_coverage_week ON public.class_coverage_logs(week_starting);

ALTER TABLE public.class_coverage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read coverage logs"
  ON public.class_coverage_logs FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch managers and teachers can insert coverage logs"
  ON public.class_coverage_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

-- Table: student_gap_analysis (individual student learning gaps)
CREATE TABLE public.student_gap_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  missing_standard_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  gap_subject text,
  gap_description text,
  remediation_status text NOT NULL DEFAULT 'pending',
  identified_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gap_class ON public.student_gap_analysis(class_id);
CREATE INDEX idx_gap_student ON public.student_gap_analysis(student_id);
CREATE INDEX idx_gap_status ON public.student_gap_analysis(remediation_status);

ALTER TABLE public.student_gap_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read gap analysis"
  ON public.student_gap_analysis FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
    WHERE s.id = student_gap_analysis.student_id AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Branch members can insert gap analysis"
  ON public.student_gap_analysis FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
    WHERE s.id = student_gap_analysis.student_id AND bm.user_id = auth.uid()
  ));

CREATE POLICY "Branch members can update gap analysis"
  ON public.student_gap_analysis FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
    WHERE s.id = student_gap_analysis.student_id AND bm.user_id = auth.uid()
  ));
