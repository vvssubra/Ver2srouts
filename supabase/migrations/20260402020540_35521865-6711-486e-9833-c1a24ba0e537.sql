ALTER TABLE public.subject_standard_map ADD COLUMN IF NOT EXISTS parent_subject text;

INSERT INTO public.subject_standard_map (subject_name, kp2026_learning_area, parent_subject)
VALUES 
  ('English - Spelling', 'Language and Literacy', 'English'),
  ('English - Reading', 'Language and Literacy', 'English'),
  ('Bahasa Melayu - Ejaan', 'Language and Literacy', 'Bahasa Melayu'),
  ('Bahasa Melayu - Bacaan', 'Language and Literacy', 'Bahasa Melayu')
ON CONFLICT (subject_name) DO UPDATE SET parent_subject = EXCLUDED.parent_subject;