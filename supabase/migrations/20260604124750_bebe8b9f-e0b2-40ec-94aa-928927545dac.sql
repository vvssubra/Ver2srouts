
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pre_enrollment_assessment JSONB,
  ADD COLUMN IF NOT EXISTS pre_enrollment_assessed_at TIMESTAMPTZ;
