ALTER TABLE public.child_update_skills
  DROP CONSTRAINT IF EXISTS child_update_skills_proficiency_level_check;

ALTER TABLE public.child_update_skills
  ADD CONSTRAINT child_update_skills_proficiency_level_check
  CHECK (
    proficiency_level IS NULL
    OR proficiency_level = ANY (ARRAY[
      'TP1','TP2','TP3',
      'not_yet','emerging','developing','consistent','secure'
    ])
  );