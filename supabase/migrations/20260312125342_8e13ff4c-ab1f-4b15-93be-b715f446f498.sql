
-- Add current_methodology to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_methodology text DEFAULT 'KP2026';

-- Create baseline_assessments table
CREATE TABLE public.baseline_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  assessed_by uuid NOT NULL,
  date_evaluated date NOT NULL DEFAULT CURRENT_DATE,
  motor_skills_score integer NOT NULL DEFAULT 1,
  language_score integer NOT NULL DEFAULT 1,
  socio_emotional_score integer NOT NULL DEFAULT 1,
  cognitive_score integer NOT NULL DEFAULT 1,
  checklist_responses jsonb DEFAULT '[]'::jsonb,
  teacher_notes text,
  ai_detected_learning_style text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create methodology_recommendations table
CREATE TABLE public.methodology_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  baseline_assessment_id uuid REFERENCES public.baseline_assessments(id) ON DELETE SET NULL,
  suggested_methodology text NOT NULL,
  ai_reasoning text,
  status text NOT NULL DEFAULT 'pending',
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for methodology_recommendations status
CREATE OR REPLACE FUNCTION public.validate_methodology_recommendation_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending, accepted, or rejected.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_methodology_status
  BEFORE INSERT OR UPDATE ON public.methodology_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.validate_methodology_recommendation_status();

-- Indexes
CREATE INDEX idx_baseline_assessments_student ON public.baseline_assessments(student_id);
CREATE INDEX idx_baseline_assessments_branch ON public.baseline_assessments(branch_id);
CREATE INDEX idx_methodology_recommendations_student ON public.methodology_recommendations(student_id);
CREATE INDEX idx_methodology_recommendations_status ON public.methodology_recommendations(status);

-- RLS for baseline_assessments
ALTER TABLE public.baseline_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access baseline_assessments"
  ON public.baseline_assessments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch members read baseline_assessments"
  ON public.baseline_assessments FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch managers write baseline_assessments"
  ON public.baseline_assessments FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch managers update baseline_assessments"
  ON public.baseline_assessments FOR UPDATE TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

-- RLS for methodology_recommendations
ALTER TABLE public.methodology_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access methodology_recommendations"
  ON public.methodology_recommendations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch members read methodology_recommendations"
  ON public.methodology_recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
      WHERE s.id = methodology_recommendations.student_id AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Branch members insert methodology_recommendations"
  ON public.methodology_recommendations FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
      WHERE s.id = methodology_recommendations.student_id AND bm.user_id = auth.uid()
    )
  );

CREATE POLICY "Branch members update methodology_recommendations"
  ON public.methodology_recommendations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.branch_memberships bm ON bm.branch_id = s.branch_id
      WHERE s.id = methodology_recommendations.student_id AND bm.user_id = auth.uid()
    )
  );

-- Allow parents to read their child's methodology recommendations
CREATE POLICY "Parents read child methodology_recommendations"
  ON public.methodology_recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid() AND ps.student_id = methodology_recommendations.student_id AND ps.status = 'approved'
    )
  );
