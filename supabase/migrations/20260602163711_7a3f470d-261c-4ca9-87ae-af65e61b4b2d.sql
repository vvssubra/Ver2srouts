ALTER TABLE public.fee_packages
  ADD COLUMN IF NOT EXISTS program_type text
  CHECK (program_type IS NULL OR program_type IN ('taska', 'preschool'));

CREATE INDEX IF NOT EXISTS idx_fee_packages_program_type
  ON public.fee_packages(program_type)
  WHERE program_type IS NOT NULL;