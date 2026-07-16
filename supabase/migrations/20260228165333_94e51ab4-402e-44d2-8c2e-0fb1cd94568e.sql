
-- Create curriculum level enum
CREATE TYPE public.curriculum_level AS ENUM ('skill', 'standard', 'sub_standard');

-- 1. Learning Areas table
CREATE TABLE public.learning_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_ms TEXT NOT NULL,
  name_en TEXT,
  description_ms TEXT,
  description_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read learning areas"
  ON public.learning_areas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage learning areas"
  ON public.learning_areas FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_learning_areas_updated_at
  BEFORE UPDATE ON public.learning_areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Curriculum Standards table (self-referencing hierarchy)
CREATE TABLE public.curriculum_standards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  learning_area_id UUID NOT NULL REFERENCES public.learning_areas(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.curriculum_standards(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  level public.curriculum_level NOT NULL,
  title_ms TEXT NOT NULL,
  title_en TEXT,
  description_ms TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_curriculum_standards_learning_area ON public.curriculum_standards(learning_area_id);
CREATE INDEX idx_curriculum_standards_parent ON public.curriculum_standards(parent_id);
CREATE INDEX idx_curriculum_standards_code ON public.curriculum_standards(code);

ALTER TABLE public.curriculum_standards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read curriculum standards"
  ON public.curriculum_standards FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage curriculum standards"
  ON public.curriculum_standards FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_curriculum_standards_updated_at
  BEFORE UPDATE ON public.curriculum_standards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Competencies table
CREATE TABLE public.competencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ms TEXT NOT NULL,
  name_en TEXT,
  description_ms TEXT,
  sub_competencies JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read competencies"
  ON public.competencies FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage competencies"
  ON public.competencies FOR ALL
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_competencies_updated_at
  BEFORE UPDATE ON public.competencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
