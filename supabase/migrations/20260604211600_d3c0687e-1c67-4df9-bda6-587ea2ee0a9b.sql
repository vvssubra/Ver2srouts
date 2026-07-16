ALTER TABLE public.lesson_plans
ADD COLUMN IF NOT EXISTS per_student_interventions jsonb;