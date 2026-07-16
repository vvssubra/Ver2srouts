
-- Observation reactions (likes)
CREATE TABLE public.observation_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid REFERENCES public.student_observations(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid NOT NULL,
  reaction_type text NOT NULL DEFAULT 'like',
  created_at timestamptz DEFAULT now(),
  UNIQUE(observation_id, parent_id, reaction_type)
);

-- Observation comments
CREATE TABLE public.observation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id uuid REFERENCES public.student_observations(id) ON DELETE CASCADE NOT NULL,
  parent_id uuid NOT NULL,
  comment_text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.observation_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_comments ENABLE ROW LEVEL SECURITY;

-- Parents can manage their own reactions
CREATE POLICY "Parents manage own reactions" ON public.observation_reactions
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Parents can read all reactions (to see counts)
CREATE POLICY "Read all reactions" ON public.observation_reactions
  FOR SELECT TO authenticated USING (true);

-- Parents manage own comments
CREATE POLICY "Parents manage own comments" ON public.observation_comments
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Read all comments on shared observations
CREATE POLICY "Read all comments" ON public.observation_comments
  FOR SELECT TO authenticated USING (true);
