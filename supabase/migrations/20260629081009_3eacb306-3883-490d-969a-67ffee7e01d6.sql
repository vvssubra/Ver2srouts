
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS check_out_time timestamptz,
  ADD COLUMN IF NOT EXISTS departure_temperature numeric,
  ADD COLUMN IF NOT EXISTS departure_mood text,
  ADD COLUMN IF NOT EXISTS departure_health_status text,
  ADD COLUMN IF NOT EXISTS departure_health_notes text,
  ADD COLUMN IF NOT EXISTS departure_body_marks text,
  ADD COLUMN IF NOT EXISTS medication_handover boolean,
  ADD COLUMN IF NOT EXISTS medication_handover_notes text,
  ADD COLUMN IF NOT EXISTS departure_photo_url text,
  ADD COLUMN IF NOT EXISTS picked_up_by text,
  ADD COLUMN IF NOT EXISTS picked_up_by_relation text,
  ADD COLUMN IF NOT EXISTS departure_notes text,
  ADD COLUMN IF NOT EXISTS checked_out_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_attendance_check_out_time ON public.attendance(check_out_time);
