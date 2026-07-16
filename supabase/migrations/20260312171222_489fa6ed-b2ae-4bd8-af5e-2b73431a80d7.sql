
-- academic_years: one per branch per school year
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  year_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- school_holidays: dates within an academic year
CREATE TABLE public.school_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  event_name text NOT NULL,
  is_public_holiday boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- yearly_themes: weekly thematic plan
CREATE TABLE public.yearly_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  main_theme text NOT NULL,
  sub_theme text,
  rationale text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Link lesson_plans to yearly_themes
ALTER TABLE public.lesson_plans ADD COLUMN yearly_theme_id uuid REFERENCES public.yearly_themes(id);

-- RLS for academic_years
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view academic years for their branch"
  ON public.academic_years FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(auth.uid(), branch_id)
  );

CREATE POLICY "Managers can manage academic years"
  ON public.academic_years FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
  );

-- RLS for school_holidays
ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view holidays"
  ON public.school_holidays FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), ay.branch_id))
    )
  );

CREATE POLICY "Managers can manage holidays"
  ON public.school_holidays FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), ay.branch_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), ay.branch_id))
    )
  );

-- RLS for yearly_themes
ALTER TABLE public.yearly_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view yearly themes"
  ON public.yearly_themes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), ay.branch_id))
    )
  );

CREATE POLICY "Managers can manage yearly themes"
  ON public.yearly_themes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), ay.branch_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_years ay
      WHERE ay.id = academic_year_id
      AND (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), ay.branch_id))
    )
  );

-- Updated_at triggers
CREATE TRIGGER update_academic_years_updated_at
  BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_yearly_themes_updated_at
  BEFORE UPDATE ON public.yearly_themes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
