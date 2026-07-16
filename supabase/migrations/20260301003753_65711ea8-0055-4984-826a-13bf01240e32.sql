
-- Create lesson_plans table
CREATE TABLE public.lesson_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  age_group TEXT NOT NULL, -- '4+', '5+', '6+'
  theme TEXT NOT NULL,
  duration TEXT NOT NULL, -- '1 day', '1 week', '2 weeks'
  learning_area_ids UUID[] NOT NULL DEFAULT '{}',
  standard_ids UUID[] NOT NULL DEFAULT '{}',
  generated_plan JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

-- Users can view their own lesson plans
CREATE POLICY "Users can view their own lesson plans"
ON public.lesson_plans FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own lesson plans
CREATE POLICY "Users can create their own lesson plans"
ON public.lesson_plans FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own lesson plans
CREATE POLICY "Users can update their own lesson plans"
ON public.lesson_plans FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own lesson plans
CREATE POLICY "Users can delete their own lesson plans"
ON public.lesson_plans FOR DELETE
USING (auth.uid() = user_id);

-- Super admins can view all lesson plans
CREATE POLICY "Super admins can view all lesson plans"
ON public.lesson_plans FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_lesson_plans_updated_at
BEFORE UPDATE ON public.lesson_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
