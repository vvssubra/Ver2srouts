
-- 1. Add programs_offered to branch_settings
ALTER TABLE public.branch_settings ADD COLUMN IF NOT EXISTS programs_offered jsonb DEFAULT '[]'::jsonb;

-- 2. Add class_id FK to students (nullable for backward compat)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

-- 3. Add suggested_program and program_reasoning to methodology_recommendations
ALTER TABLE public.methodology_recommendations ADD COLUMN IF NOT EXISTS suggested_program text;
ALTER TABLE public.methodology_recommendations ADD COLUMN IF NOT EXISTS program_reasoning text;
