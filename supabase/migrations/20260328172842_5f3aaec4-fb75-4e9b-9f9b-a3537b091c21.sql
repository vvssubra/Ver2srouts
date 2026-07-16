
-- Phase 3: Observation engine, learning journey, readiness snapshots

-- 1. observation_indicators
CREATE TABLE public.observation_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  age_group integer NOT NULL,
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE CASCADE NOT NULL,
  linked_outcome_id uuid REFERENCES public.development_outcomes(id) ON DELETE SET NULL,
  indicator_code text NOT NULL,
  indicator_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.observation_indicators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read observation_indicators" ON public.observation_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins can manage observation_indicators" ON public.observation_indicators FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. student_observation_evidence
CREATE TABLE public.student_observation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  indicator_id uuid REFERENCES public.observation_indicators(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_yet',
  evidence_note text,
  evidence_photo_url text,
  observed_on date NOT NULL DEFAULT CURRENT_DATE,
  teacher_id uuid NOT NULL,
  next_step text,
  internal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_observation_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read evidence in their branch" ON public.student_observation_evidence FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_student_in_user_branch(auth.uid(), student_id)
);
CREATE POLICY "Staff can insert evidence" ON public.student_observation_evidence FOR INSERT TO authenticated WITH CHECK (
  public.is_student_in_user_branch(auth.uid(), student_id)
);
CREATE POLICY "Staff can update evidence" ON public.student_observation_evidence FOR UPDATE TO authenticated USING (
  public.is_student_in_user_branch(auth.uid(), student_id)
);
CREATE POLICY "Staff can delete evidence" ON public.student_observation_evidence FOR DELETE TO authenticated USING (
  teacher_id = auth.uid() OR public.is_super_admin(auth.uid())
);

-- 3. daily_learning_journey_entries
CREATE TABLE public.daily_learning_journey_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  lesson_plan_id uuid REFERENCES public.lesson_plans(id) ON DELETE SET NULL,
  theme_bank_id uuid REFERENCES public.theme_bank(id) ON DELETE SET NULL,
  entry_type text NOT NULL DEFAULT 'quick_observation',
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  linked_indicator_id uuid REFERENCES public.observation_indicators(id) ON DELETE SET NULL,
  title text NOT NULL,
  teacher_note text,
  parent_summary text,
  next_step text,
  visible_to_parent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
ALTER TABLE public.daily_learning_journey_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read journey entries in branch" ON public.daily_learning_journey_entries FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR public.is_student_in_user_branch(auth.uid(), student_id)
);
CREATE POLICY "Parents can read visible journey entries" ON public.daily_learning_journey_entries FOR SELECT TO authenticated USING (
  visible_to_parent = true AND EXISTS (
    SELECT 1 FROM public.parent_students ps WHERE ps.student_id = daily_learning_journey_entries.student_id AND ps.parent_id = auth.uid() AND ps.status = 'approved'
  )
);
CREATE POLICY "Staff can insert journey entries" ON public.daily_learning_journey_entries FOR INSERT TO authenticated WITH CHECK (
  public.is_student_in_user_branch(auth.uid(), student_id)
);
CREATE POLICY "Staff can update journey entries" ON public.daily_learning_journey_entries FOR UPDATE TO authenticated USING (
  created_by = auth.uid() OR public.is_super_admin(auth.uid())
);
CREATE POLICY "Staff can delete journey entries" ON public.daily_learning_journey_entries FOR DELETE TO authenticated USING (
  created_by = auth.uid() OR public.is_super_admin(auth.uid())
);

-- 4. learning_journey_media
CREATE TABLE public.learning_journey_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_entry_id uuid REFERENCES public.daily_learning_journey_entries(id) ON DELETE CASCADE NOT NULL,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_journey_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read journey media for visible entries" ON public.learning_journey_media FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.daily_learning_journey_entries e WHERE e.id = journey_entry_id)
);
CREATE POLICY "Staff can insert journey media" ON public.learning_journey_media FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.daily_learning_journey_entries e WHERE e.id = journey_entry_id AND public.is_student_in_user_branch(auth.uid(), e.student_id))
);
CREATE POLICY "Staff can delete journey media" ON public.learning_journey_media FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.daily_learning_journey_entries e WHERE e.id = journey_entry_id AND (e.created_by = auth.uid() OR public.is_super_admin(auth.uid())))
);

-- 5. parent_feed_notifications
CREATE TABLE public.parent_feed_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  journey_entry_id uuid REFERENCES public.daily_learning_journey_entries(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz
);
ALTER TABLE public.parent_feed_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parents can read own feed notifications" ON public.parent_feed_notifications FOR SELECT TO authenticated USING (parent_id = auth.uid());
CREATE POLICY "Staff can insert feed notifications" ON public.parent_feed_notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Parents can update own feed notifications" ON public.parent_feed_notifications FOR UPDATE TO authenticated USING (parent_id = auth.uid());

-- 6. class_readiness_snapshots
CREATE TABLE public.class_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  term text NOT NULL,
  language_summary_json jsonb DEFAULT '{}',
  literacy_summary_json jsonb DEFAULT '{}',
  numeracy_summary_json jsonb DEFAULT '{}',
  motor_summary_json jsonb DEFAULT '{}',
  social_summary_json jsonb DEFAULT '{}',
  self_help_summary_json jsonb DEFAULT '{}',
  next_focus_json jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.class_readiness_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read readiness snapshots" ON public.class_readiness_snapshots FOR SELECT TO authenticated USING (
  public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.classes c JOIN public.branch_memberships bm ON bm.branch_id = c.branch_id WHERE c.id = class_id AND bm.user_id = auth.uid()
  )
);
CREATE POLICY "Staff can manage readiness snapshots" ON public.class_readiness_snapshots FOR ALL TO authenticated USING (
  public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.classes c JOIN public.branch_memberships bm ON bm.branch_id = c.branch_id WHERE c.id = class_id AND bm.user_id = auth.uid()
  )
) WITH CHECK (
  public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.classes c JOIN public.branch_memberships bm ON bm.branch_id = c.branch_id WHERE c.id = class_id AND bm.user_id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_obs_indicators_domain ON public.observation_indicators(domain_id);
CREATE INDEX idx_obs_indicators_age ON public.observation_indicators(age_group);
CREATE INDEX idx_obs_evidence_student ON public.student_observation_evidence(student_id);
CREATE INDEX idx_obs_evidence_teacher ON public.student_observation_evidence(teacher_id);
CREATE INDEX idx_obs_evidence_date ON public.student_observation_evidence(observed_on);
CREATE INDEX idx_journey_entries_student ON public.daily_learning_journey_entries(student_id);
CREATE INDEX idx_journey_entries_date ON public.daily_learning_journey_entries(created_at);
CREATE INDEX idx_journey_entries_visible ON public.daily_learning_journey_entries(visible_to_parent) WHERE visible_to_parent = true;
CREATE INDEX idx_parent_feed_parent ON public.parent_feed_notifications(parent_id);
CREATE INDEX idx_readiness_class ON public.class_readiness_snapshots(class_id);
