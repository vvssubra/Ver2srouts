
-- Add review/completeness columns to lesson_plans
ALTER TABLE public.lesson_plans 
  ADD COLUMN IF NOT EXISTS completeness_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Add observation_linked_count to class_coverage_logs
ALTER TABLE public.class_coverage_logs
  ADD COLUMN IF NOT EXISTS observation_linked_count integer DEFAULT 0;

-- Create lesson_plan_reviews table for review history
CREATE TABLE IF NOT EXISTS public.lesson_plan_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE CASCADE NOT NULL,
  reviewer_id uuid NOT NULL,
  action text NOT NULL, -- approved, returned_for_revision
  comments text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lesson_plan_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can manage reviews" ON public.lesson_plan_reviews
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
