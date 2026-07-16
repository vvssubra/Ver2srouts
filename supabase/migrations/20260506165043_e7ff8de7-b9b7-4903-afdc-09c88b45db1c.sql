ALTER TABLE public.staff_designations
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'non_teaching';

CREATE INDEX IF NOT EXISTS staff_designations_category_idx
  ON public.staff_designations(branch_id, category);