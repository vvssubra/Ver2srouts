-- Allow human-friendly indicator labels and align proficiency vocabulary on child_update_skills
ALTER TABLE public.child_update_skills
  ADD COLUMN IF NOT EXISTS indicator_label text;

-- Drop the rigid TP1/TP2/TP3 check so we can also accept emerging/developing/consistent
ALTER TABLE public.child_update_skills
  DROP CONSTRAINT IF EXISTS child_update_skills_proficiency_level_check;

ALTER TABLE public.child_update_skills
  ADD CONSTRAINT child_update_skills_proficiency_level_check
  CHECK (
    proficiency_level IS NULL
    OR proficiency_level IN ('TP1','TP2','TP3','emerging','developing','consistent')
  );