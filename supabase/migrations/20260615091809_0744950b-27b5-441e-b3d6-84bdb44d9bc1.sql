
CREATE TABLE IF NOT EXISTS public.curriculum_vocabulary (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  age_profile_id uuid NOT NULL REFERENCES public.age_profiles(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  theme_id uuid REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  objective_id uuid REFERENCES public.curriculum_objectives(id) ON DELETE SET NULL,
  english_word text,
  bm_word text,
  word_type text NOT NULL DEFAULT 'theme_word',
  vocabulary_level text NOT NULL DEFAULT 'receptive',
  parent_example_sentence_en text,
  parent_example_sentence_bm text,
  teacher_prompt_en text,
  teacher_prompt_bm text,
  activity_context text,
  active_status boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_vocabulary_word_type_chk CHECK (word_type IN (
    'theme_word','action_word','concept_word','social_word','feeling_word',
    'instruction_word','descriptive_word','question_word'
  )),
  CONSTRAINT curriculum_vocabulary_level_chk CHECK (vocabulary_level IN (
    'receptive','expressive','extension'
  )),
  CONSTRAINT curriculum_vocabulary_at_least_one_language CHECK (
    coalesce(nullif(btrim(english_word), ''), nullif(btrim(bm_word), '')) IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS curriculum_vocabulary_age_idx ON public.curriculum_vocabulary(age_profile_id);
CREATE INDEX IF NOT EXISTS curriculum_vocabulary_theme_idx ON public.curriculum_vocabulary(theme_id) WHERE theme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS curriculum_vocabulary_domain_idx ON public.curriculum_vocabulary(domain_id) WHERE domain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS curriculum_vocabulary_objective_idx ON public.curriculum_vocabulary(objective_id) WHERE objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS curriculum_vocabulary_active_idx ON public.curriculum_vocabulary(active_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_vocabulary TO authenticated;
GRANT ALL ON public.curriculum_vocabulary TO service_role;

ALTER TABLE public.curriculum_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read vocabulary"
  ON public.curriculum_vocabulary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Curriculum admins can insert vocabulary"
  ON public.curriculum_vocabulary FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Curriculum admins can update vocabulary"
  ON public.curriculum_vocabulary FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Curriculum admins can delete vocabulary"
  ON public.curriculum_vocabulary FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_curriculum_vocabulary_updated_at
  BEFORE UPDATE ON public.curriculum_vocabulary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
