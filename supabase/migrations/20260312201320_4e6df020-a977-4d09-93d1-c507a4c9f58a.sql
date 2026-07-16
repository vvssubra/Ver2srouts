
-- 1. UNIQUE constraint on class_coverage_logs to prevent duplicate AI memory entries
ALTER TABLE public.class_coverage_logs
ADD CONSTRAINT uq_class_coverage_logs_entry
UNIQUE (class_id, subject_name, standard_code, week_starting);

-- 2. Create lesson_activities relational table
CREATE TABLE public.lesson_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_plan_id UUID NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  activity_name TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 30,
  learning_area TEXT NOT NULL DEFAULT '',
  standards_addressed JSONB DEFAULT '[]'::jsonb,
  procedure JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lesson_activities ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage activities on their own lesson plans
CREATE POLICY "Users can read own lesson activities"
ON public.lesson_activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    WHERE lp.id = lesson_plan_id AND lp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own lesson activities"
ON public.lesson_activities FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    WHERE lp.id = lesson_plan_id AND lp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own lesson activities"
ON public.lesson_activities FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    WHERE lp.id = lesson_plan_id AND lp.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete own lesson activities"
ON public.lesson_activities FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.lesson_plans lp
    WHERE lp.id = lesson_plan_id AND lp.user_id = auth.uid()
  )
);

-- Index for fast lookups
CREATE INDEX idx_lesson_activities_plan_id ON public.lesson_activities(lesson_plan_id);
