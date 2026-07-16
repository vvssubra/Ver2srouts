ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS overtime_rate_rest_day NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate_public_holiday NUMERIC DEFAULT 0;