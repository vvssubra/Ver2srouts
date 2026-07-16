ALTER TABLE public.marketing_spend
  ADD COLUMN IF NOT EXISTS spend_start_date date,
  ADD COLUMN IF NOT EXISTS spend_end_date date;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_received_date date;

UPDATE public.leads
  SET lead_received_date = inquiry_date
  WHERE lead_received_date IS NULL AND inquiry_date IS NOT NULL;