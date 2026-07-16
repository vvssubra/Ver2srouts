ALTER TABLE public.baseline_assessments
  ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'progression';

-- Backfill: the earliest assessment per student is the baseline.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY student_id
           ORDER BY date_evaluated ASC NULLS LAST, created_at ASC
         ) AS rn
  FROM public.baseline_assessments
)
UPDATE public.baseline_assessments b
SET assessment_type = CASE WHEN r.rn = 1 THEN 'baseline' ELSE 'progression' END
FROM ranked r
WHERE b.id = r.id;

CREATE INDEX IF NOT EXISTS baseline_assessments_student_type_idx
  ON public.baseline_assessments(student_id, assessment_type);