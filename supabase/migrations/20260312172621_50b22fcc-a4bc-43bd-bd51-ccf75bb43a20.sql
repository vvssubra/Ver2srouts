
-- Create daily_timetable_slots table
CREATE TABLE public.daily_timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  subject_name text NOT NULL,
  source_slot_id uuid REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  is_modified boolean DEFAULT false,
  event_name text,
  event_description text,
  event_agenda jsonb DEFAULT '[]'::jsonb,
  is_parallel_group boolean DEFAULT false,
  parallel_group_label text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(class_id, slot_date, start_time, subject_name)
);

CREATE INDEX idx_daily_timetable_class_date ON public.daily_timetable_slots(class_id, slot_date);
CREATE INDEX idx_daily_timetable_branch_date ON public.daily_timetable_slots(branch_id, slot_date);

-- Add daily_slot_id to slot_lesson_plans (nullable for backward compat)
ALTER TABLE public.slot_lesson_plans ADD COLUMN daily_slot_id uuid REFERENCES public.daily_timetable_slots(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.daily_timetable_slots ENABLE ROW LEVEL SECURITY;

-- Read policy: branch members can read
CREATE POLICY "Branch members can read daily slots"
ON public.daily_timetable_slots
FOR SELECT
TO authenticated
USING (is_member_of_branch(auth.uid(), branch_id));

-- Write policy: branch managers can insert/update/delete
CREATE POLICY "Branch managers can manage daily slots"
ON public.daily_timetable_slots
FOR ALL
TO authenticated
USING (is_branch_manager(auth.uid(), branch_id))
WITH CHECK (is_branch_manager(auth.uid(), branch_id));
