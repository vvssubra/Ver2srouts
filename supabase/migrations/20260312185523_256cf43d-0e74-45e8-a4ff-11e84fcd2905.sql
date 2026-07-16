
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'tour';
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.tours ADD COLUMN IF NOT EXISTS completed_at timestamptz;
