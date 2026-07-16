
-- Add missing columns to lesson_objectives for Phase 3
ALTER TABLE public.lesson_objectives
  ADD COLUMN IF NOT EXISTS learning_area text DEFAULT '',
  ADD COLUMN IF NOT EXISTS difficulty_level text DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS objective_type text DEFAULT 'core';

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_lesson_objectives_learning_area ON public.lesson_objectives(learning_area);
CREATE INDEX IF NOT EXISTS idx_lesson_objectives_difficulty ON public.lesson_objectives(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_lesson_objectives_type ON public.lesson_objectives(objective_type);
