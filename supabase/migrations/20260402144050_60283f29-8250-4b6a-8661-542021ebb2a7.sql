-- Add SMART goal structured fields to yearly_outcomes
ALTER TABLE public.yearly_outcomes
  ADD COLUMN IF NOT EXISTS smart_specific text,
  ADD COLUMN IF NOT EXISTS smart_measurable text,
  ADD COLUMN IF NOT EXISTS smart_achievable text,
  ADD COLUMN IF NOT EXISTS smart_relevant text,
  ADD COLUMN IF NOT EXISTS smart_timebound text,
  ADD COLUMN IF NOT EXISTS smart_score integer DEFAULT 0;