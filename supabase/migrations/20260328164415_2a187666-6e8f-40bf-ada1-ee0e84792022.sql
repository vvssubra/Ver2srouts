
-- =============================================
-- SPROUT ACADEMIC MODULE V2 — PHASE 1 SCHEMA
-- =============================================

-- 1. Development Domains
CREATE TABLE public.development_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.development_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read domains" ON public.development_domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage domains" ON public.development_domains FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Age Profiles
CREATE TABLE public.age_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group INTEGER UNIQUE NOT NULL,
  stage_name TEXT NOT NULL,
  description TEXT,
  school_readiness_band TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.age_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read age_profiles" ON public.age_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage age_profiles" ON public.age_profiles FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 3. Development Outcomes
CREATE TABLE public.development_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  age_profile_id UUID NOT NULL REFERENCES public.age_profiles(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES public.development_domains(id) ON DELETE CASCADE,
  outcome_code TEXT NOT NULL,
  outcome_title TEXT NOT NULL,
  outcome_description TEXT,
  term_targets JSONB DEFAULT '{}',
  mastery_expectation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.development_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read outcomes" ON public.development_outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage outcomes" ON public.development_outcomes FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. Development Indicators
CREATE TABLE public.development_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_id UUID NOT NULL REFERENCES public.development_outcomes(id) ON DELETE CASCADE,
  indicator_text TEXT NOT NULL,
  observable_examples JSONB DEFAULT '[]',
  evidence_type TEXT DEFAULT 'observation',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.development_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read indicators" ON public.development_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage indicators" ON public.development_indicators FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Theme Bank
CREATE TABLE public.theme_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_name TEXT NOT NULL,
  month_number INTEGER NOT NULL,
  big_idea TEXT,
  key_vocabulary JSONB DEFAULT '[]',
  key_concepts JSONB DEFAULT '[]',
  suggested_books JSONB DEFAULT '[]',
  suggested_songs JSONB DEFAULT '[]',
  center_suggestions JSONB DEFAULT '[]',
  parent_connection JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.theme_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read theme_bank" ON public.theme_bank FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage theme_bank" ON public.theme_bank FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 6. Theme Weekly Focuses
CREATE TABLE public.theme_weekly_focuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_bank_id UUID NOT NULL REFERENCES public.theme_bank(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  focus_title TEXT NOT NULL,
  focus_description TEXT,
  key_questions JSONB DEFAULT '[]',
  suggested_domains JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.theme_weekly_focuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read weekly_focuses" ON public.theme_weekly_focuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admin manage weekly_focuses" ON public.theme_weekly_focuses FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 7. Monthly Curriculum Plans
CREATE TABLE public.monthly_curriculum_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  age_group INTEGER NOT NULL,
  month_number INTEGER NOT NULL,
  theme_bank_id UUID REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  big_idea TEXT,
  monthly_objectives JSONB DEFAULT '[]',
  assessment_focus JSONB DEFAULT '[]',
  family_connection JSONB DEFAULT '{}',
  center_setup JSONB DEFAULT '[]',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, class_id, month_number, academic_year_id)
);
ALTER TABLE public.monthly_curriculum_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Branch members read monthly plans" ON public.monthly_curriculum_plans FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id)
);
CREATE POLICY "Branch managers write monthly plans" ON public.monthly_curriculum_plans FOR INSERT TO authenticated WITH CHECK (
  public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  OR (public.has_role(auth.uid(), 'teacher') AND public.is_member_of_branch(auth.uid(), branch_id))
);
CREATE POLICY "Branch managers update monthly plans" ON public.monthly_curriculum_plans FOR UPDATE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  OR (public.has_role(auth.uid(), 'teacher') AND public.is_member_of_branch(auth.uid(), branch_id))
);
CREATE POLICY "Branch managers delete monthly plans" ON public.monthly_curriculum_plans FOR DELETE TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
);

-- 8. Weekly Curriculum Plans
CREATE TABLE public.weekly_curriculum_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_plan_id UUID NOT NULL REFERENCES public.monthly_curriculum_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  focus_title TEXT,
  focus_questions JSONB DEFAULT '[]',
  weekly_objectives JSONB DEFAULT '[]',
  provocations JSONB DEFAULT '[]',
  materials JSONB DEFAULT '[]',
  observation_focus JSONB DEFAULT '[]',
  center_setup JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(monthly_plan_id, week_number)
);
ALTER TABLE public.weekly_curriculum_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read weekly plans via monthly" ON public.weekly_curriculum_plans FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.monthly_curriculum_plans m WHERE m.id = monthly_plan_id AND (
    public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), m.branch_id)
  ))
);
CREATE POLICY "Write weekly plans via monthly" ON public.weekly_curriculum_plans FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.monthly_curriculum_plans m WHERE m.id = monthly_plan_id AND (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), m.branch_id)
    OR (public.has_role(auth.uid(), 'teacher') AND public.is_member_of_branch(auth.uid(), m.branch_id))
  ))
);
CREATE POLICY "Update weekly plans via monthly" ON public.weekly_curriculum_plans FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.monthly_curriculum_plans m WHERE m.id = monthly_plan_id AND (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), m.branch_id)
    OR (public.has_role(auth.uid(), 'teacher') AND public.is_member_of_branch(auth.uid(), m.branch_id))
  ))
);
CREATE POLICY "Delete weekly plans via monthly" ON public.weekly_curriculum_plans FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.monthly_curriculum_plans m WHERE m.id = monthly_plan_id AND (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), m.branch_id)
  ))
);

-- 9. School Philosophy Settings
CREATE TABLE public.school_philosophy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID UNIQUE NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  philosophy_type TEXT NOT NULL DEFAULT 'balanced',
  custom_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.school_philosophy_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Branch members read philosophy" ON public.school_philosophy_settings FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id)
);
CREATE POLICY "Branch managers write philosophy" ON public.school_philosophy_settings FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
) WITH CHECK (
  public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
);

-- 10. Extend yearly_themes
ALTER TABLE public.yearly_themes
  ADD COLUMN IF NOT EXISTS age_group INTEGER,
  ADD COLUMN IF NOT EXISTS month_number INTEGER,
  ADD COLUMN IF NOT EXISTS term_number INTEGER,
  ADD COLUMN IF NOT EXISTS theme_bank_id UUID REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS weekly_focus TEXT,
  ADD COLUMN IF NOT EXISTS development_focus JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS key_vocabulary JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS key_questions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS observation_focus JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS family_connection JSONB DEFAULT '{}';

-- 11. Extend class_coverage_logs
ALTER TABLE public.class_coverage_logs
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES public.development_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcome_id UUID REFERENCES public.development_outcomes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS indicator_id UUID REFERENCES public.development_indicators(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coverage_type TEXT,
  ADD COLUMN IF NOT EXISTS theme_bank_id UUID REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS weekly_focus TEXT,
  ADD COLUMN IF NOT EXISTS month_number INTEGER;

-- 12. Updated_at triggers
CREATE TRIGGER update_monthly_curriculum_plans_updated_at BEFORE UPDATE ON public.monthly_curriculum_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_curriculum_plans_updated_at BEFORE UPDATE ON public.weekly_curriculum_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_school_philosophy_updated_at BEFORE UPDATE ON public.school_philosophy_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SEED DATA
-- =============================================

-- Seed Development Domains
INSERT INTO public.development_domains (code, name, description, sort_order) VALUES
('CL', 'Communication & Language', 'Listening, speaking, understanding, and expressing ideas through verbal and non-verbal communication.', 1),
('EL', 'Early Literacy', 'Print awareness, letter knowledge, phonics, early reading and writing skills.', 2),
('NT', 'Numeracy & Thinking', 'Number sense, patterns, shapes, measurement, problem-solving, and logical thinking.', 3),
('PM', 'Physical & Motor Development', 'Gross motor, fine motor, body coordination, health awareness, and self-care skills.', 4),
('SE', 'Social-Emotional & Self-Help', 'Emotional regulation, social skills, independence, self-care, and relationship building.', 5),
('CD', 'Creativity & Discovery', 'Art, music, dramatic play, exploration, inquiry, and creative expression.', 6),
('VC', 'Values, Community & Belonging', 'Cultural awareness, respect, responsibility, environmental care, and community values.', 7);

-- Seed Age Profiles
INSERT INTO public.age_profiles (age_group, stage_name, description, school_readiness_band) VALUES
(3, 'Nursery / Playgroup', 'Sensory exploration, routines, movement, language immersion. Minimal worksheet dependence.', 'Emerging'),
(4, 'Pre-Kindergarten', 'Balanced play and guided concept development. Growing independence and social skills.', 'Developing'),
(5, 'Kindergarten 1', 'Stronger school-readiness and structured concept work. Building literacy and numeracy foundations.', 'Approaching'),
(6, 'Kindergarten 2', 'Stronger literacy, numeracy, independence, and project work. Transition readiness.', 'Ready');

-- Seed Theme Bank (12 monthly themes)
INSERT INTO public.theme_bank (theme_name, month_number, big_idea, key_vocabulary, key_concepts, suggested_books, suggested_songs, center_suggestions, parent_connection) VALUES
('All About Me', 1, 'Every child is unique and special.', '["name","body","feelings","senses","special"]', '["identity","self-awareness","body parts","emotions"]', '["The Name Jar","I Like Myself","My Body Belongs to Me"]', '["Head Shoulders Knees and Toes","If You''re Happy and You Know It"]', '["Mirror station","Self-portrait art","Sensory tray"]', '{"tip":"Talk about what makes your child special","activity":"Create a family identity poster"}'),
('My Family & Home', 2, 'Families care for each other in different ways.', '["family","home","love","care","roles"]', '["family structure","roles","home environment","caring"]', '["Families Families Families","A Chair for My Mother"]', '["Family Finger Song","My Home"]', '["Home corner setup","Family photo wall","Sorting household items"]', '{"tip":"Share family stories at bedtime","activity":"Draw your family tree together"}'),
('My School & Friends', 3, 'School is a safe place to learn and grow with friends.', '["school","friend","share","rule","teacher"]', '["friendship","sharing","classroom rules","routines"]', '["David Goes to School","How to Be a Friend"]', '["Make New Friends","The More We Get Together"]', '["Friendship bracelets","Rule chart making","Partner games"]', '{"tip":"Ask about one friend each day","activity":"Role-play being kind at home"}'),
('Colours, Shapes & Patterns', 4, 'The world is full of colours, shapes, and patterns waiting to be discovered.', '["colour","shape","pattern","sort","compare"]', '["colour mixing","shape recognition","AB patterns","sorting"]', '["Mouse Paint","The Shape of Things"]', '["I Can Sing a Rainbow","Shape Song"]', '["Colour mixing station","Pattern block table","Shape hunt outdoors"]', '{"tip":"Point out shapes during walks","activity":"Make a colour scavenger hunt"}'),
('Animals & Habitats', 5, 'Animals live in different places and have different needs.', '["animal","habitat","farm","wild","sea"]', '["animal classification","habitats","food chains","care"]', '["Dear Zoo","The Very Hungry Caterpillar"]', '["Old MacDonald","Walking Through the Jungle"]', '["Animal figurines with habitats","Pet care role-play","Ocean sensory bin"]', '{"tip":"Visit a pet shop or farm","activity":"Research your child''s favourite animal together"}'),
('Food & Healthy Habits', 6, 'Good food helps our bodies grow strong and healthy.', '["food","healthy","fruit","vegetable","hygiene"]', '["food groups","healthy vs sometimes foods","cooking","hygiene"]', '["The Very Hungry Caterpillar","Eating the Alphabet"]', '["Apples and Bananas","Wash Your Hands"]', '["Pretend kitchen","Food sorting","Cooking corner"]', '{"tip":"Cook a simple recipe together","activity":"Create a healthy plate collage"}'),
('Plants & Nature', 7, 'Plants are living things that need care to grow.', '["plant","seed","grow","leaf","root"]', '["plant parts","growth cycle","insects","caring for nature"]', '["The Tiny Seed","Planting a Rainbow"]', '["Oats Peas Beans","The Garden Song"]', '["Planting station","Magnifying glass exploration","Nature collage"]', '{"tip":"Plant a seed together at home","activity":"Go on a nature walk and collect leaves"}'),
('Transport & Movement', 8, 'Different vehicles help us travel in different ways.', '["car","bus","plane","boat","wheel"]', '["land/air/water transport","safety","movement","speed"]', '["The Wheels on the Bus","Planes","Boats"]', '["Wheels on the Bus","Row Row Row Your Boat"]', '["Vehicle garage","Road map play","Building ramps"]', '{"tip":"Count different vehicles on a trip","activity":"Build a vehicle from recycled materials"}'),
('Community Helpers', 9, 'Many people work together to keep our community safe and running.', '["helper","doctor","police","teacher","firefighter"]', '["community roles","helping","safety","gratitude"]', '["Whose Hat Is This?","Community Helpers from A to Z"]', '["People in Your Neighborhood","Thank You Song"]', '["Doctor clinic role-play","Fire station dramatic play","Helper dress-up"]', '{"tip":"Talk about different jobs you see","activity":"Write a thank-you card to a community helper"}'),
('Weather & Environment', 10, 'Weather changes and we can help care for the earth.', '["sunny","rainy","windy","cloud","earth"]', '["weather types","seasons","clothing","environmental care"]', '["The Cloud Book","The Earth Book"]', '["Rain Rain Go Away","Mr Sun"]', '["Weather station","Water cycle experiment","Recycling sort"]', '{"tip":"Check the weather together each morning","activity":"Start a simple recycling habit at home"}'),
('Culture, Celebration & My World', 11, 'We celebrate in different ways and respect each other''s traditions.', '["culture","festival","tradition","celebrate","respect"]', '["cultural diversity","festivals","respect","Malaysia"]', '["This Is How We Do It","Festivals Around the World"]', '["Rasa Sayang","One World One Song"]', '["Cultural costume corner","Festival craft station","World map display"]', '{"tip":"Share a family tradition with your child","activity":"Cook a traditional dish together"}'),
('Review, Projects & Transition', 12, 'We have grown so much — let''s celebrate and look ahead!', '["review","project","grow","celebrate","ready"]', '["reflection","portfolio","showcase","transition readiness"]', '["Oh the Places You''ll Go","The Dot"]', '["We Did It","Goodbye Song"]', '["Portfolio station","Project display","Graduation craft"]', '{"tip":"Celebrate your child''s growth this year","activity":"Create a memory book of the year"}');

-- Seed Theme Weekly Focuses (4 per theme = 48 total)
DO $$
DECLARE
  theme_rec RECORD;
  focuses TEXT[][];
BEGIN
  focuses := ARRAY[
    -- Month 1: All About Me
    ARRAY['My name and identity','Who am I? What makes me special?'],
    ARRAY['My body parts','What can my body do?'],
    ARRAY['My feelings','How do I feel today?'],
    ARRAY['My likes, dislikes, and abilities','What am I good at?'],
    -- Month 2: My Family & Home
    ARRAY['Family members','Who is in my family?'],
    ARRAY['Roles in the family','What does each person do?'],
    ARRAY['My home and rooms','What rooms are in my home?'],
    ARRAY['Helping, love, and care','How do we show love?'],
    -- Month 3: My School & Friends
    ARRAY['My classroom','What is in our classroom?'],
    ARRAY['My teachers and school helpers','Who helps us at school?'],
    ARRAY['Friends and sharing','How do we share and take turns?'],
    ARRAY['Rules, routine, and responsibility','Why do we have rules?'],
    -- Month 4: Colours, Shapes & Patterns
    ARRAY['Basic colours','What colours do we see?'],
    ARRAY['Basic shapes','What shapes are around us?'],
    ARRAY['Size, comparison, and sorting','Which is bigger or smaller?'],
    ARRAY['Patterns and creative combinations','What comes next in the pattern?'],
    -- Month 5: Animals & Habitats
    ARRAY['Farm animals','Which animals live on farms?'],
    ARRAY['Wild animals','Where do wild animals live?'],
    ARRAY['Sea animals','What lives in the ocean?'],
    ARRAY['Homes, food, and habitats','How do animals find food and shelter?'],
    -- Month 6: Food & Healthy Habits
    ARRAY['Fruits and vegetables','What fruits and vegetables do we eat?'],
    ARRAY['Healthy and sometimes foods','Which foods help us grow strong?'],
    ARRAY['Cooking, measuring, and preparation','How do we prepare food?'],
    ARRAY['Hygiene, safety, and healthy routines','Why do we wash our hands?'],
    -- Month 7: Plants & Nature
    ARRAY['Parts of a plant','What parts does a plant have?'],
    ARRAY['How plants grow','What do plants need to grow?'],
    ARRAY['Insects and small creatures','What small creatures live near plants?'],
    ARRAY['Caring for nature','How can we take care of nature?'],
    -- Month 8: Transport & Movement
    ARRAY['Land transport','What vehicles travel on roads?'],
    ARRAY['Air transport','What flies in the sky?'],
    ARRAY['Water transport','What floats on water?'],
    ARRAY['Travel safety and movement','How do we stay safe when travelling?'],
    -- Month 9: Community Helpers
    ARRAY['Doctor and nurse','How do doctors and nurses help us?'],
    ARRAY['Police and firefighter','How do police and firefighters keep us safe?'],
    ARRAY['Teacher, chef, cleaner, builder','What other helpers do we know?'],
    ARRAY['Helpers in my neighborhood','Who helps in our community?'],
    -- Month 10: Weather & Environment
    ARRAY['Sunny and rainy','What happens when it is sunny or rainy?'],
    ARRAY['Windy and cloudy','What can wind and clouds do?'],
    ARRAY['Clothes and activities for weather','What do we wear in different weather?'],
    ARRAY['Caring for the earth','How can we help the earth?'],
    -- Month 11: Culture, Celebration & My World
    ARRAY['My culture and family traditions','What traditions does my family have?'],
    ARRAY['Festivals we celebrate','What festivals do we celebrate?'],
    ARRAY['Malaysia and the world around me','What is special about Malaysia?'],
    ARRAY['Respecting differences','How are we the same and different?'],
    -- Month 12: Review, Projects & Transition
    ARRAY['Review of language and literacy','What have we learned in language?'],
    ARRAY['Review of numeracy and concepts','What have we learned in maths?'],
    ARRAY['Project/showcase work','Let us show what we can do!'],
    ARRAY['Transition and celebration','We are ready for the next step!']
  ];

  FOR theme_rec IN SELECT id, month_number FROM public.theme_bank ORDER BY month_number LOOP
    FOR i IN 1..4 LOOP
      INSERT INTO public.theme_weekly_focuses (theme_bank_id, week_number, focus_title, focus_description, key_questions)
      VALUES (
        theme_rec.id,
        i,
        focuses[(theme_rec.month_number - 1) * 4 + i][1],
        focuses[(theme_rec.month_number - 1) * 4 + i][1],
        jsonb_build_array(focuses[(theme_rec.month_number - 1) * 4 + i][2])
      );
    END LOOP;
  END LOOP;
END $$;

-- Seed Development Outcomes (key outcomes per age per domain)
DO $$
DECLARE
  d_cl UUID; d_el UUID; d_nt UUID; d_pm UUID; d_se UUID; d_cd UUID; d_vc UUID;
  ap3 UUID; ap4 UUID; ap5 UUID; ap6 UUID;
BEGIN
  SELECT id INTO d_cl FROM development_domains WHERE code='CL';
  SELECT id INTO d_el FROM development_domains WHERE code='EL';
  SELECT id INTO d_nt FROM development_domains WHERE code='NT';
  SELECT id INTO d_pm FROM development_domains WHERE code='PM';
  SELECT id INTO d_se FROM development_domains WHERE code='SE';
  SELECT id INTO d_cd FROM development_domains WHERE code='CD';
  SELECT id INTO d_vc FROM development_domains WHERE code='VC';
  SELECT id INTO ap3 FROM age_profiles WHERE age_group=3;
  SELECT id INTO ap4 FROM age_profiles WHERE age_group=4;
  SELECT id INTO ap5 FROM age_profiles WHERE age_group=5;
  SELECT id INTO ap6 FROM age_profiles WHERE age_group=6;

  -- AGE 3
  INSERT INTO development_outcomes (age_profile_id, domain_id, outcome_code, outcome_title) VALUES
  (ap3, d_cl, 'CL3.1', 'Speaks in short phrases to express needs and wants'),
  (ap3, d_cl, 'CL3.2', 'Names familiar people, objects, and actions'),
  (ap3, d_cl, 'CL3.3', 'Follows simple 1-step instructions'),
  (ap3, d_el, 'EL3.1', 'Enjoys listening to stories'),
  (ap3, d_el, 'EL3.2', 'Recognizes own name/photo label'),
  (ap3, d_el, 'EL3.3', 'Joins rhymes and songs with repetition'),
  (ap3, d_nt, 'NT3.1', 'Counts 1-3 with objects'),
  (ap3, d_nt, 'NT3.2', 'Sorts by one attribute'),
  (ap3, d_nt, 'NT3.3', 'Matches same-to-same pictures or objects'),
  (ap3, d_pm, 'PM3.1', 'Holds crayons with more control'),
  (ap3, d_pm, 'PM3.2', 'Tears, pastes, stacks, and begins snipping'),
  (ap3, d_pm, 'PM3.3', 'Runs, jumps, climbs, balances with support'),
  (ap3, d_se, 'SE3.1', 'Separates more calmly from caregiver'),
  (ap3, d_se, 'SE3.2', 'Joins simple group routines'),
  (ap3, d_se, 'SE3.3', 'Washes hands and tidies up with support'),
  (ap3, d_cd, 'CD3.1', 'Joins pretend play'),
  (ap3, d_cd, 'CD3.2', 'Explores sensory materials'),
  (ap3, d_vc, 'VC3.1', 'Learns kindness, greetings, waiting turn'),

  -- AGE 4
  (ap4, d_cl, 'CL4.1', 'Speaks in short sentences'),
  (ap4, d_cl, 'CL4.2', 'Answers simple questions'),
  (ap4, d_cl, 'CL4.3', 'Follows 2-step instructions'),
  (ap4, d_el, 'EL4.1', 'Recognizes letters in own name and some others'),
  (ap4, d_el, 'EL4.2', 'Joins sound play, rhymes, and story recall'),
  (ap4, d_el, 'EL4.3', 'Begins tracing and meaningful mark making'),
  (ap4, d_nt, 'NT4.1', 'Counts 1-10 with one-to-one understanding'),
  (ap4, d_nt, 'NT4.2', 'Identifies basic shapes and simple patterns'),
  (ap4, d_nt, 'NT4.3', 'Sorts, compares, matches with guidance'),
  (ap4, d_pm, 'PM4.1', 'Holds pencil with better control'),
  (ap4, d_pm, 'PM4.2', 'Cuts on a thick line'),
  (ap4, d_pm, 'PM4.3', 'Hops, balances, throws, catches with growing control'),
  (ap4, d_se, 'SE4.1', 'Takes turns and shares with reminders'),
  (ap4, d_se, 'SE4.2', 'Expresses simple feelings'),
  (ap4, d_se, 'SE4.3', 'Follows classroom routine more independently'),
  (ap4, d_cd, 'CD4.1', 'Builds, draws, role-plays, and explores with intention'),
  (ap4, d_vc, 'VC4.1', 'Understands simple responsibility and respect'),

  -- AGE 5
  (ap5, d_cl, 'CL5.1', 'Speaks in fuller sentences'),
  (ap5, d_cl, 'CL5.2', 'Retells simple experiences or stories'),
  (ap5, d_cl, 'CL5.3', 'Asks and answers simple why/what/how questions'),
  (ap5, d_el, 'EL5.1', 'Identifies many letters and some beginning sounds'),
  (ap5, d_el, 'EL5.2', 'Writes own name and attempts simple words/sentences'),
  (ap5, d_el, 'EL5.3', 'Enjoys shared reading with stronger print awareness'),
  (ap5, d_nt, 'NT5.1', 'Counts 1-20 with understanding'),
  (ap5, d_nt, 'NT5.2', 'Compares quantity, extends patterns, solves simple problems'),
  (ap5, d_nt, 'NT5.3', 'Begins simple addition/subtraction using materials'),
  (ap5, d_pm, 'PM5.1', 'Uses scissors, pencil, and glue with stronger control'),
  (ap5, d_pm, 'PM5.2', 'Copies shapes and patterns'),
  (ap5, d_pm, 'PM5.3', 'Joins coordinated movement games'),
  (ap5, d_se, 'SE5.1', 'Works in small groups'),
  (ap5, d_se, 'SE5.2', 'Regulates behavior better'),
  (ap5, d_se, 'SE5.3', 'Manages routines more independently'),
  (ap5, d_cd, 'CD5.1', 'Plans and improves simple creations'),
  (ap5, d_cd, 'CD5.2', 'Talks about experiments and nature'),
  (ap5, d_vc, 'VC5.1', 'Shows empathy, fairness, gratitude, environmental care'),

  -- AGE 6
  (ap6, d_cl, 'CL6.1', 'Explains ideas clearly'),
  (ap6, d_cl, 'CL6.2', 'Follows 3-step directions'),
  (ap6, d_cl, 'CL6.3', 'Joins discussion confidently'),
  (ap6, d_el, 'EL6.1', 'Reads simple texts at beginner level'),
  (ap6, d_el, 'EL6.2', 'Writes 2-5 linked sentences'),
  (ap6, d_el, 'EL6.3', 'Shows beginning comprehension and sequencing'),
  (ap6, d_nt, 'NT6.1', 'Adds and subtracts within 20 using concrete and pictorial support'),
  (ap6, d_nt, 'NT6.2', 'Solves simple word problems'),
  (ap6, d_nt, 'NT6.3', 'Recognizes number patterns and relationships'),
  (ap6, d_pm, 'PM6.1', 'Shows stronger writing stamina and hand control'),
  (ap6, d_pm, 'PM6.2', 'Manages materials and tasks independently'),
  (ap6, d_se, 'SE6.1', 'Solves simple social conflicts with language'),
  (ap6, d_se, 'SE6.2', 'Stays engaged in longer tasks'),
  (ap6, d_cd, 'CD6.1', 'Completes simple inquiry or project work'),
  (ap6, d_cd, 'CD6.2', 'Presents or explains work to others'),
  (ap6, d_vc, 'VC6.1', 'Shows leadership, inclusion, and responsibility');
END $$;
