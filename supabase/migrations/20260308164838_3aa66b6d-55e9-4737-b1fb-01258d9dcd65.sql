
-- Create ptm_reports table
CREATE TABLE public.ptm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  term_name text NOT NULL,
  generated_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  generated_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ptm_reports ENABLE ROW LEVEL SECURITY;

-- Branch members can view
CREATE POLICY "Branch members view ptm reports"
  ON public.ptm_reports FOR SELECT
  TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

-- Teachers/franchisees manage branch reports
CREATE POLICY "Franchisees manage ptm reports"
  ON public.ptm_reports FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

-- Teachers can insert and update their own reports
CREATE POLICY "Teachers insert ptm reports"
  ON public.ptm_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = generated_by AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Teachers update own ptm reports"
  ON public.ptm_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = generated_by);

-- Parents view published reports for their children
CREATE POLICY "Parents view published ptm reports"
  ON public.ptm_reports FOR SELECT
  TO authenticated
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM parent_students ps WHERE ps.student_id = ptm_reports.student_id AND ps.parent_id = auth.uid()
  ));

-- Super admins manage all
CREATE POLICY "Super admins manage ptm reports"
  ON public.ptm_reports FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()));
