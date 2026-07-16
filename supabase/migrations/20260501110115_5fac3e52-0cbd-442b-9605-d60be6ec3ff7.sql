-- ============================================================
-- Unified "Daily Updates" tables
-- ============================================================

CREATE TABLE public.child_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL,
  class_id UUID,
  student_id UUID, -- nullable: group updates use child_update_students instead
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL,

  -- Teacher input
  caption TEXT,
  teacher_note TEXT,

  -- AI-generated, editable
  parent_summary TEXT,
  ai_learning_story TEXT,

  -- Tagging (AI-suggested, teacher confirms)
  domain_id UUID,
  indicator_id UUID,
  proficiency_level TEXT, -- 'tp1' | 'tp2' | 'tp3' | 'emerging' | 'consistent' | etc.

  -- Album assignment (AI-suggested)
  album_id UUID,

  -- Sharing & flags
  visible_to_parent BOOLEAN NOT NULL DEFAULT false,
  milestone_flag BOOLEAN NOT NULL DEFAULT false,
  portfolio_candidate BOOLEAN NOT NULL DEFAULT false,

  -- Optional source links
  source_lesson_plan_id UUID,
  source_timetable_slot_id UUID,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'shared' | 'archived'

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_updates_branch ON public.child_updates(branch_id);
CREATE INDEX idx_child_updates_class ON public.child_updates(class_id);
CREATE INDEX idx_child_updates_student ON public.child_updates(student_id);
CREATE INDEX idx_child_updates_album ON public.child_updates(album_id);
CREATE INDEX idx_child_updates_date ON public.child_updates(activity_date DESC);
CREATE INDEX idx_child_updates_visible ON public.child_updates(visible_to_parent) WHERE visible_to_parent = true;

CREATE TRIGGER trg_child_updates_updated_at
  BEFORE UPDATE ON public.child_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Media attachments
CREATE TABLE public.child_update_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'photo', -- 'photo' | 'video'
  width INTEGER,
  height INTEGER,
  duration_s INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_child_update_media_update ON public.child_update_media(update_id);

-- Group updates: many students per update
CREATE TABLE public.child_update_students (
  update_id UUID NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  PRIMARY KEY (update_id, student_id)
);

CREATE INDEX idx_child_update_students_student ON public.child_update_students(student_id);

-- ============================================================
-- Helper function: can the user view this update?
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_user_view_child_update(_update_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.child_updates cu
    WHERE cu.id = _update_id
      AND (
        public.is_super_admin(_user_id)
        OR public.is_member_of_branch(_user_id, cu.branch_id)
        OR (
          cu.visible_to_parent = true
          AND (
            -- Single-student update
            (cu.student_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.parent_students ps
              WHERE ps.student_id = cu.student_id
                AND ps.parent_id = _user_id
                AND ps.status = 'approved'
            ))
            OR
            -- Group update via join table
            EXISTS (
              SELECT 1
              FROM public.child_update_students cus
              JOIN public.parent_students ps ON ps.student_id = cus.student_id
              WHERE cus.update_id = cu.id
                AND ps.parent_id = _user_id
                AND ps.status = 'approved'
            )
          )
        )
      )
  );
$$;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.child_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_update_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_update_students ENABLE ROW LEVEL SECURITY;

-- child_updates --------------------------------------------------
CREATE POLICY "Super admins manage all child_updates"
  ON public.child_updates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch staff view branch child_updates"
  ON public.child_updates FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch staff insert branch child_updates"
  ON public.child_updates FOR INSERT TO authenticated
  WITH CHECK (
    public.is_member_of_branch(auth.uid(), branch_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Branch staff update branch child_updates"
  ON public.child_updates FOR UPDATE TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Branch staff delete branch child_updates"
  ON public.child_updates FOR DELETE TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Parents view shared child_updates for their children"
  ON public.child_updates FOR SELECT TO authenticated
  USING (
    visible_to_parent = true
    AND (
      (student_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.parent_students ps
        WHERE ps.student_id = child_updates.student_id
          AND ps.parent_id = auth.uid()
          AND ps.status = 'approved'
      ))
      OR EXISTS (
        SELECT 1
        FROM public.child_update_students cus
        JOIN public.parent_students ps ON ps.student_id = cus.student_id
        WHERE cus.update_id = child_updates.id
          AND ps.parent_id = auth.uid()
          AND ps.status = 'approved'
      )
    )
  );

-- child_update_media ---------------------------------------------
CREATE POLICY "Super admins manage all child_update_media"
  ON public.child_update_media FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "View media if can view parent update"
  ON public.child_update_media FOR SELECT TO authenticated
  USING (public.can_user_view_child_update(update_id, auth.uid()));

CREATE POLICY "Branch staff insert media for branch updates"
  ON public.child_update_media FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND public.is_member_of_branch(auth.uid(), cu.branch_id)
    )
  );

CREATE POLICY "Branch staff update media for branch updates"
  ON public.child_update_media FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND public.is_member_of_branch(auth.uid(), cu.branch_id)
    )
  );

CREATE POLICY "Branch staff delete media for branch updates"
  ON public.child_update_media FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND public.is_member_of_branch(auth.uid(), cu.branch_id)
    )
  );

-- child_update_students ------------------------------------------
CREATE POLICY "Super admins manage all child_update_students"
  ON public.child_update_students FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "View update-students if can view update"
  ON public.child_update_students FOR SELECT TO authenticated
  USING (public.can_user_view_child_update(update_id, auth.uid()));

CREATE POLICY "Branch staff manage update-students for branch"
  ON public.child_update_students FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND public.is_member_of_branch(auth.uid(), cu.branch_id)
    )
  );

CREATE POLICY "Branch staff delete update-students for branch"
  ON public.child_update_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND public.is_member_of_branch(auth.uid(), cu.branch_id)
    )
  );