
-- Create classes table
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  class_name text NOT NULL,
  age_group text NOT NULL DEFAULT '5+',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read classes" ON public.classes
  FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers can manage classes" ON public.classes
  FOR ALL TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

-- Create timetable_slots table
CREATE TABLE public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time time NOT NULL,
  end_time time NOT NULL,
  subject_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read timetable slots" ON public.timetable_slots
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = timetable_slots.class_id
    AND (public.is_member_of_branch(auth.uid(), c.branch_id) OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Branch managers can manage timetable slots" ON public.timetable_slots
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = timetable_slots.class_id
    AND (public.is_branch_manager(auth.uid(), c.branch_id) OR public.is_super_admin(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = timetable_slots.class_id
    AND (public.is_branch_manager(auth.uid(), c.branch_id) OR public.is_super_admin(auth.uid()))
  ));

-- Create slot_lesson_plans table
CREATE TABLE public.slot_lesson_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  lesson_date date NOT NULL,
  theme text NOT NULL,
  generated_activity jsonb NOT NULL DEFAULT '{}',
  mapped_learning_area text,
  mapped_standards text[] DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slot_lesson_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can read slot lesson plans" ON public.slot_lesson_plans
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = slot_lesson_plans.class_id
    AND (public.is_member_of_branch(auth.uid(), c.branch_id) OR public.is_super_admin(auth.uid()))
  ));

CREATE POLICY "Teachers and managers can create slot lesson plans" ON public.slot_lesson_plans
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Teachers and managers can update own slot lesson plans" ON public.slot_lesson_plans
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Create subject_standard_map table
CREATE TABLE public.subject_standard_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_name text NOT NULL UNIQUE,
  kp2026_learning_area text NOT NULL,
  description text
);

ALTER TABLE public.subject_standard_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read subject map" ON public.subject_standard_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admins can manage subject map" ON public.subject_standard_map
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
