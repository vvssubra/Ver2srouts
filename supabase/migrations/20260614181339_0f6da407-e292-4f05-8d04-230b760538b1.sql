
INSERT INTO public.age_profiles (age_group, stage_name, description, school_readiness_band)
VALUES (2, 'Toddler', 'Ages 2–3 exploratory stage', 'pre_nursery')
ON CONFLICT (age_group) DO NOTHING;

CREATE TABLE public.curriculum_objectives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  age_profile_id UUID NOT NULL REFERENCES public.age_profiles(id) ON DELETE RESTRICT,
  domain_id UUID NOT NULL REFERENCES public.development_domains(id) ON DELETE RESTRICT,
  objective_code TEXT NOT NULL,
  parent_title TEXT NOT NULL,
  parent_description TEXT,
  teacher_title TEXT NOT NULL,
  teacher_description TEXT,
  observable_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  level TEXT,
  recommended_term TEXT,
  objective_type TEXT NOT NULL DEFAULT 'core' CHECK (objective_type IN ('core','emerging','extension')),
  parent_visible BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'sprouts' CHECK (source IN ('sprouts','kspk_aligned','school_custom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (age_profile_id, domain_id, objective_code)
);

CREATE INDEX idx_curriculum_objectives_age_domain
  ON public.curriculum_objectives (age_profile_id, domain_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_objectives TO authenticated;
GRANT ALL ON public.curriculum_objectives TO service_role;

ALTER TABLE public.curriculum_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read curriculum_objectives"
  ON public.curriculum_objectives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Curriculum staff manage curriculum_objectives"
  ON public.curriculum_objectives FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TABLE public.curriculum_objective_indicators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  objective_id UUID NOT NULL REFERENCES public.curriculum_objectives(id) ON DELETE CASCADE,
  indicator_label TEXT NOT NULL,
  evidence_example TEXT,
  observation_prompt TEXT,
  proficiency_levels TEXT[] NOT NULL DEFAULT ARRAY['not_yet','emerging','developing','secure']::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_curriculum_objective_indicators_obj
  ON public.curriculum_objective_indicators (objective_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_objective_indicators TO authenticated;
GRANT ALL ON public.curriculum_objective_indicators TO service_role;

ALTER TABLE public.curriculum_objective_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read curriculum_objective_indicators"
  ON public.curriculum_objective_indicators FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Curriculum staff manage curriculum_objective_indicators"
  ON public.curriculum_objective_indicators FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'franchisee'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_curriculum_objectives_updated_at
  BEFORE UPDATE ON public.curriculum_objectives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_curriculum_objective_indicators_updated_at
  BEFORE UPDATE ON public.curriculum_objective_indicators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
