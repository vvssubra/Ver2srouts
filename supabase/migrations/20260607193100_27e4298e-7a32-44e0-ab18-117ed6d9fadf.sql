ALTER TABLE public.marketing_spend ADD COLUMN IF NOT EXISTS sources text[];
UPDATE public.marketing_spend SET sources = ARRAY[source] WHERE sources IS NULL AND source IS NOT NULL;