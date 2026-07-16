
-- Add missing columns to theme_bank
ALTER TABLE public.theme_bank ADD COLUMN IF NOT EXISTS age_group integer;

-- Add status to monthly_curriculum_plans
ALTER TABLE public.monthly_curriculum_plans ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- Add status and created_by to weekly_curriculum_plans
ALTER TABLE public.weekly_curriculum_plans ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.weekly_curriculum_plans ADD COLUMN IF NOT EXISTS created_by uuid;
