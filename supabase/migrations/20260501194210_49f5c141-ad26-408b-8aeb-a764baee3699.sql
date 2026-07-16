
-- ===== ptm_slots =====
CREATE TABLE public.ptm_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  teacher_id UUID NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location TEXT,
  notes TEXT,
  capacity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open', -- open | closed | cancelled
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ptm_slots_branch_date ON public.ptm_slots(branch_id, slot_date);
CREATE INDEX idx_ptm_slots_class ON public.ptm_slots(class_id);

ALTER TABLE public.ptm_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage ptm_slots in their branch"
  ON public.ptm_slots
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR is_branch_manager(auth.uid(), branch_id) OR is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (is_super_admin(auth.uid()) OR is_branch_manager(auth.uid(), branch_id) OR is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Parents view open slots for their child class"
  ON public.ptm_slots
  FOR SELECT
  TO authenticated
  USING (
    status IN ('open', 'closed')
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      JOIN public.students s ON s.id = ps.student_id
      WHERE ps.parent_id = auth.uid()
        AND ps.status = 'approved'
        AND (
          ptm_slots.class_id IS NULL OR s.class_id = ptm_slots.class_id
        )
        AND s.branch_id = ptm_slots.branch_id
    )
  );

CREATE TRIGGER set_ptm_slots_updated_at
  BEFORE UPDATE ON public.ptm_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== ptm_bookings =====
CREATE TABLE public.ptm_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.ptm_slots(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | declined | cancelled | completed
  parent_notes TEXT,
  staff_notes TEXT,
  ptm_meeting_id UUID REFERENCES public.ptm_meetings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, student_id)
);

CREATE INDEX idx_ptm_bookings_parent ON public.ptm_bookings(parent_id);
CREATE INDEX idx_ptm_bookings_branch_status ON public.ptm_bookings(branch_id, status);
CREATE INDEX idx_ptm_bookings_student ON public.ptm_bookings(student_id);

ALTER TABLE public.ptm_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents manage own ptm_bookings"
  ON public.ptm_bookings
  FOR ALL
  TO authenticated
  USING (
    parent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = ptm_bookings.student_id
        AND ps.status = 'approved'
    )
  )
  WITH CHECK (
    parent_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid()
        AND ps.student_id = ptm_bookings.student_id
        AND ps.status = 'approved'
    )
  );

CREATE POLICY "Staff manage ptm_bookings in their branch"
  ON public.ptm_bookings
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()) OR is_branch_manager(auth.uid(), branch_id) OR is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (is_super_admin(auth.uid()) OR is_branch_manager(auth.uid(), branch_id) OR is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER set_ptm_bookings_updated_at
  BEFORE UPDATE ON public.ptm_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Auto-create ptm_meetings when a booking is confirmed =====
CREATE OR REPLACE FUNCTION public.sync_ptm_booking_to_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_meeting_id UUID;
BEGIN
  IF NEW.status = 'confirmed' AND (OLD.status IS DISTINCT FROM 'confirmed') AND NEW.ptm_meeting_id IS NULL THEN
    SELECT * INTO v_slot FROM public.ptm_slots WHERE id = NEW.slot_id;
    INSERT INTO public.ptm_meetings (
      student_id, class_id, branch_id, meeting_date, meeting_time,
      teacher_id, status
    ) VALUES (
      NEW.student_id, v_slot.class_id, NEW.branch_id, v_slot.slot_date, v_slot.start_time,
      v_slot.teacher_id, 'scheduled'
    ) RETURNING id INTO v_meeting_id;
    NEW.ptm_meeting_id := v_meeting_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_ptm_booking_to_meeting
  BEFORE UPDATE ON public.ptm_bookings
  FOR EACH ROW EXECUTE FUNCTION public.sync_ptm_booking_to_meeting();
