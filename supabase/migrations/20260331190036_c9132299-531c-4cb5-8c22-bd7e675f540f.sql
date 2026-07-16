
-- Extend daily_learning_journey_entries with portfolio/milestone columns
ALTER TABLE public.daily_learning_journey_entries 
  ADD COLUMN IF NOT EXISTS milestone_flag boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS portfolio_candidate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS teacher_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz DEFAULT null,
  ADD COLUMN IF NOT EXISTS parent_visibility_status text DEFAULT 'draft';

-- Create student_monthly_summaries table
CREATE TABLE public.student_monthly_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  month integer NOT NULL,
  year integer NOT NULL,
  summary_text text,
  strengths_json jsonb,
  home_extensions_json jsonb,
  domains_explored text[],
  milestone_count integer DEFAULT 0,
  entry_count integer DEFAULT 0,
  generated_by uuid,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(student_id, month, year)
);

-- Enable RLS
ALTER TABLE public.student_monthly_summaries ENABLE ROW LEVEL SECURITY;

-- Branch members can manage summaries
CREATE POLICY "Branch members can manage summaries"
  ON public.student_monthly_summaries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.branch_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.branch_id = student_monthly_summaries.branch_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.branch_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.branch_id = student_monthly_summaries.branch_id
    )
  );

-- Parents can view published summaries for their children
CREATE POLICY "Parents can view published summaries"
  ON public.student_monthly_summaries
  FOR SELECT
  TO authenticated
  USING (
    status = 'published' AND
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid() AND ps.student_id = student_monthly_summaries.student_id AND ps.status = 'approved'
    )
  );
