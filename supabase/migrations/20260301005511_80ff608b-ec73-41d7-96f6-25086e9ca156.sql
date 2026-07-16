
-- Create shared_plans table for plan sharing between teachers
CREATE TABLE public.shared_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_plan_id UUID NOT NULL REFERENCES public.lesson_plans(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL,
  shared_with UUID NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shared_plans ENABLE ROW LEVEL SECURITY;

-- Users can see plans shared with them
CREATE POLICY "Users can view plans shared with them"
ON public.shared_plans FOR SELECT
USING (auth.uid() = shared_with OR auth.uid() = shared_by);

-- Users can share their own plans
CREATE POLICY "Users can share their own plans"
ON public.shared_plans FOR INSERT
WITH CHECK (
  auth.uid() = shared_by
  AND EXISTS (SELECT 1 FROM public.lesson_plans WHERE id = lesson_plan_id AND user_id = auth.uid())
);

-- Users can delete shares they created
CREATE POLICY "Users can delete their shares"
ON public.shared_plans FOR DELETE
USING (auth.uid() = shared_by);

-- Super admins manage all
CREATE POLICY "Super admins manage shared plans"
ON public.shared_plans FOR ALL
USING (is_super_admin(auth.uid()));

-- Index for performance
CREATE INDEX idx_shared_plans_shared_with ON public.shared_plans(shared_with);
CREATE INDEX idx_shared_plans_lesson_plan_id ON public.shared_plans(lesson_plan_id);
