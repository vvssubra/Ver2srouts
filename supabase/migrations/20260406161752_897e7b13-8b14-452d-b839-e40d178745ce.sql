ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS epf_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS socso_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS eis_enabled boolean DEFAULT true;