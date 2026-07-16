ALTER TABLE public.tours DROP CONSTRAINT IF EXISTS tours_status_check;
ALTER TABLE public.tours ADD CONSTRAINT tours_status_check
  CHECK (status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'pending'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text]));
ALTER TABLE public.tours ALTER COLUMN status SET DEFAULT 'requested'::text;