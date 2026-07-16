
-- Phase 2: Extend month and week plans with richer content fields

ALTER TABLE public.curriculum_month_plans
  ADD COLUMN IF NOT EXISTS big_idea text,
  ADD COLUMN IF NOT EXISTS vocabulary jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS concepts jsonb DEFAULT '[]';

ALTER TABLE public.curriculum_week_plans
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS key_questions jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS observation_focus jsonb DEFAULT '[]';
