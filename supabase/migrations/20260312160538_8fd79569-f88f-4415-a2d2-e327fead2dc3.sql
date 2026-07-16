
-- 1. Add parallel group columns to timetable_slots
ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS is_parallel_group boolean DEFAULT false;
ALTER TABLE public.timetable_slots ADD COLUMN IF NOT EXISTS parallel_group_label text;

-- 2. Add teacher notes and resource links to lesson_plans
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS teacher_notes text;
ALTER TABLE public.lesson_plans ADD COLUMN IF NOT EXISTS resource_links jsonb DEFAULT '[]'::jsonb;

-- 3. Add lesson plan and timetable slot linking to student_observations
ALTER TABLE public.student_observations ADD COLUMN IF NOT EXISTS lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL;
ALTER TABLE public.student_observations ADD COLUMN IF NOT EXISTS timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL;
