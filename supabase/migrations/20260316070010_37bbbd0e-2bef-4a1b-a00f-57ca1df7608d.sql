ALTER TABLE public.leave_requests 
ADD COLUMN IF NOT EXISTS cancelled_by uuid,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
ADD COLUMN IF NOT EXISTS applied_on_behalf_by uuid,
ADD COLUMN IF NOT EXISTS is_half_day boolean DEFAULT false;