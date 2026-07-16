
ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS resignation_date date,
  ADD COLUMN IF NOT EXISTS resignation_reason text,
  ADD COLUMN IF NOT EXISTS last_working_date date;
