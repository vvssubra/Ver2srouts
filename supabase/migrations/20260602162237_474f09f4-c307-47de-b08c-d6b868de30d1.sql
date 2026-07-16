
INSERT INTO public.age_groups (code, label, min_age_months, max_age_months, sort_order)
VALUES
  ('AGE1', '1 Year',  12, 23, 0),
  ('AGE2', '2 Years', 24, 35, 0)
ON CONFLICT (code) DO NOTHING;

UPDATE public.age_groups SET sort_order = 1 WHERE code = 'AGE1';
UPDATE public.age_groups SET sort_order = 2 WHERE code = 'AGE2';
UPDATE public.age_groups SET sort_order = 3 WHERE code = 'AGE3';
UPDATE public.age_groups SET sort_order = 4 WHERE code = 'AGE4';
UPDATE public.age_groups SET sort_order = 5 WHERE code = 'AGE5';
UPDATE public.age_groups SET sort_order = 6 WHERE code = 'AGE6';

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'preschool'
    CHECK (program_type IN ('taska', 'preschool'));

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS program_type text NOT NULL DEFAULT 'preschool'
    CHECK (program_type IN ('taska', 'preschool'));

UPDATE public.classes
SET program_type = 'taska'
WHERE program_type = 'preschool'
  AND (
    age_group ILIKE '1%' OR age_group ILIKE '2%' OR
    age_group IN ('AGE1', 'AGE2', '1 Year', '2 Years', '1-2', '2-3')
  );

UPDATE public.students s
SET program_type = 'taska'
WHERE s.program_type = 'preschool'
  AND s.age_group_id IN (
    SELECT id FROM public.age_groups WHERE code IN ('AGE1', 'AGE2')
  );

UPDATE public.students s
SET program_type = 'taska'
WHERE s.program_type = 'preschool'
  AND s.class_id IN (SELECT id FROM public.classes WHERE program_type = 'taska');

CREATE INDEX IF NOT EXISTS idx_classes_program_type ON public.classes(program_type);
CREATE INDEX IF NOT EXISTS idx_students_program_type ON public.students(program_type);
