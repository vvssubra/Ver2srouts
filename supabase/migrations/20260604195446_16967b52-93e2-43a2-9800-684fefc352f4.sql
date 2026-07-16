ALTER TABLE public.baseline_assessments
  ADD COLUMN IF NOT EXISTS domain_scores jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.baseline_assessments.domain_scores IS
  'KSPK Tunjang 7-domain scores keyed by domain code (CL, EL, NT, PM, SE, CD, VC). Legacy motor_skills_score/language_score/socio_emotional_score/cognitive_score columns remain for back-compat.';