
ALTER TABLE public.monthly_curriculum_plans 
  ADD COLUMN IF NOT EXISTS suggested_books jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_songs jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.yearly_themes 
  ADD COLUMN IF NOT EXISTS theme_bank_id uuid REFERENCES public.theme_bank(id);
