
-- Phase 4: Extend ptm_reports + create ptm_meetings + ptm_action_items

-- Extend ptm_reports with new structured columns
ALTER TABLE public.ptm_reports
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_term text,
  ADD COLUMN IF NOT EXISTS report_type text NOT NULL DEFAULT 'summary',
  ADD COLUMN IF NOT EXISTS strengths_json jsonb,
  ADD COLUMN IF NOT EXISTS support_areas_json jsonb,
  ADD COLUMN IF NOT EXISTS evidence_summary_json jsonb,
  ADD COLUMN IF NOT EXISTS teacher_comment text,
  ADD COLUMN IF NOT EXISTS parent_support_json jsonb,
  ADD COLUMN IF NOT EXISTS action_plan_json jsonb,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Create ptm_meetings table
CREATE TABLE public.ptm_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  meeting_date date NOT NULL,
  meeting_time time,
  teacher_id uuid NOT NULL,
  parent_attendee_names text,
  agenda_json jsonb,
  discussion_notes text,
  agreed_actions_json jsonb,
  followup_date date,
  status text NOT NULL DEFAULT 'scheduled',
  ptm_report_id uuid REFERENCES public.ptm_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create ptm_action_items table
CREATE TABLE public.ptm_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ptm_meeting_id uuid REFERENCES public.ptm_meetings(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  action_owner text NOT NULL,
  action_text text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ptm_meetings_student ON public.ptm_meetings(student_id);
CREATE INDEX IF NOT EXISTS idx_ptm_meetings_branch ON public.ptm_meetings(branch_id);
CREATE INDEX IF NOT EXISTS idx_ptm_meetings_date ON public.ptm_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_ptm_action_items_meeting ON public.ptm_action_items(ptm_meeting_id);
CREATE INDEX IF NOT EXISTS idx_ptm_action_items_student ON public.ptm_action_items(student_id);
CREATE INDEX IF NOT EXISTS idx_ptm_reports_class ON public.ptm_reports(class_id);

-- Enable RLS
ALTER TABLE public.ptm_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptm_action_items ENABLE ROW LEVEL SECURITY;

-- RLS for ptm_meetings: branch-scoped staff access
CREATE POLICY "Staff can manage ptm_meetings in their branch"
  ON public.ptm_meetings FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_member_of_branch(auth.uid(), branch_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_member_of_branch(auth.uid(), branch_id)
  );

-- Parents can read meetings for their children
CREATE POLICY "Parents can view their children ptm_meetings"
  ON public.ptm_meetings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = ptm_meetings.student_id
        AND ps.status = 'approved'
    )
  );

-- RLS for ptm_action_items: branch-scoped staff access
CREATE POLICY "Staff can manage ptm_action_items in their branch"
  ON public.ptm_action_items FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_member_of_branch(auth.uid(), branch_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR public.is_member_of_branch(auth.uid(), branch_id)
  );

-- Parents can read action items for their children
CREATE POLICY "Parents can view their children ptm_action_items"
  ON public.ptm_action_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = ptm_action_items.student_id
        AND ps.status = 'approved'
    )
  );

-- Updated_at triggers
CREATE TRIGGER set_ptm_meetings_updated_at
  BEFORE UPDATE ON public.ptm_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_ptm_action_items_updated_at
  BEFORE UPDATE ON public.ptm_action_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
