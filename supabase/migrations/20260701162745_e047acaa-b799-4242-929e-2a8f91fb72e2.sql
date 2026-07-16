
-- 1. Extend weekly_teaching_subjects: optional class scope
ALTER TABLE public.weekly_teaching_subjects
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Replace old unique(week_plan_id, subject) with a per-class unique (nullable class_id treated as scalar).
ALTER TABLE public.weekly_teaching_subjects
  DROP CONSTRAINT IF EXISTS weekly_teaching_subjects_week_plan_id_subject_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_wts_week_class_subject
  ON public.weekly_teaching_subjects (
    week_plan_id,
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    subject
  );

CREATE INDEX IF NOT EXISTS idx_wts_class ON public.weekly_teaching_subjects(class_id);

-- 2. weekly_teaching_sessions
CREATE TABLE IF NOT EXISTS public.weekly_teaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_teaching_subject_id uuid REFERENCES public.weekly_teaching_subjects(id) ON DELETE CASCADE,
  week_plan_id uuid NOT NULL REFERENCES public.curriculum_week_plans(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,

  subject text NOT NULL,
  session_date date NOT NULL,
  day_of_week text NOT NULL,

  timetable_slot_id uuid NULL,
  start_time time NULL,
  end_time time NULL,

  resource_source_type text NOT NULL DEFAULT 'commercial_book'
    CHECK (resource_source_type IN (
      'commercial_book','sprouts_internal_resource','approved_worksheet',
      'flashcard','hands_on_activity','song_story','no_resource'
    )),
  book_title text NULL,
  page_from text NULL,
  page_to text NULL,
  worksheet_id uuid NULL,
  internal_resource_id uuid NULL,

  skill_focus text NOT NULL DEFAULT '',
  key_words jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_note text NULL,

  ai_materials_needed jsonb NULL,
  ai_activity_note text NULL,
  ai_lesson_steps jsonb NULL,
  ai_observation_focus text NULL,
  ai_differentiation text NULL,
  ai_parent_home_practice text NULL,
  ai_teacher_reflection_prompt text NULL,
  ai_generated_at timestamptz NULL,

  teacher_review_status text NOT NULL DEFAULT 'draft'
    CHECK (teacher_review_status IN ('draft','reviewed','edited','approved')),

  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wtsess_week_plan ON public.weekly_teaching_sessions(week_plan_id);
CREATE INDEX IF NOT EXISTS idx_wtsess_class ON public.weekly_teaching_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_wtsess_subject ON public.weekly_teaching_sessions(subject);
CREATE INDEX IF NOT EXISTS idx_wtsess_date ON public.weekly_teaching_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_wtsess_wts ON public.weekly_teaching_sessions(weekly_teaching_subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_teaching_sessions TO authenticated;
GRANT ALL ON public.weekly_teaching_sessions TO service_role;

ALTER TABLE public.weekly_teaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wtsess_read_via_week_plan" ON public.weekly_teaching_sessions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_sessions.week_plan_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), w.branch_id))
  )
);

CREATE POLICY "wtsess_manage_via_week_plan" ON public.weekly_teaching_sessions
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_sessions.week_plan_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), w.branch_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.curriculum_week_plans w
    WHERE w.id = weekly_teaching_sessions.week_plan_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), w.branch_id))
  )
);

CREATE TRIGGER trg_wtsess_updated_at
BEFORE UPDATE ON public.weekly_teaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. commercial_book_page_mappings
CREATE TABLE IF NOT EXISTS public.commercial_book_page_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  book_title text NOT NULL,
  subject text NOT NULL,
  age_group text NULL,

  page_from text NOT NULL,
  page_to text NULL,

  skill_focus text NOT NULL,
  learning_goal_text text NULL,
  key_words jsonb NOT NULL DEFAULT '[]'::jsonb,
  difficulty_level text NULL,
  theme_tags jsonb NULL,
  teacher_notes text NULL,

  approved_by_principal boolean NOT NULL DEFAULT false,

  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_bookmap_scope
  ON public.commercial_book_page_mappings (
    branch_id, lower(book_title), subject,
    COALESCE(age_group,''), page_from, COALESCE(page_to,'')
  );

CREATE INDEX IF NOT EXISTS idx_bookmap_branch ON public.commercial_book_page_mappings(branch_id);
CREATE INDEX IF NOT EXISTS idx_bookmap_book ON public.commercial_book_page_mappings(lower(book_title));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_book_page_mappings TO authenticated;
GRANT ALL ON public.commercial_book_page_mappings TO service_role;

ALTER TABLE public.commercial_book_page_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bookmap_read_branch" ON public.commercial_book_page_mappings
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_member_of_branch(auth.uid(), branch_id)
);

CREATE POLICY "bookmap_insert_branch" ON public.commercial_book_page_mappings
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_member_of_branch(auth.uid(), branch_id)
);

CREATE POLICY "bookmap_update_owner_or_admin" ON public.commercial_book_page_mappings
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "bookmap_delete_owner_or_admin" ON public.commercial_book_page_mappings
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER trg_bookmap_updated_at
BEFORE UPDATE ON public.commercial_book_page_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
