
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_vocabulary_seed_unique
  ON public.curriculum_vocabulary (
    age_profile_id,
    word_type,
    lower(coalesce(english_word, '')),
    lower(coalesce(bm_word, ''))
  );
