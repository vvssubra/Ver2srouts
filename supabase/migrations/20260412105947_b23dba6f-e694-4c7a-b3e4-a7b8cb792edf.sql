
-- 1. Create staff_geofence_assignments table
CREATE TABLE public.staff_geofence_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Primary',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.staff_geofence_assignments ENABLE ROW LEVEL SECURITY;

-- Branch managers can manage assignments in their branch
CREATE POLICY "Branch managers can view geofence assignments"
ON public.staff_geofence_assignments FOR SELECT
USING (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Branch managers can insert geofence assignments"
ON public.staff_geofence_assignments FOR INSERT
WITH CHECK (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Branch managers can update geofence assignments"
ON public.staff_geofence_assignments FOR UPDATE
USING (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Branch managers can delete geofence assignments"
ON public.staff_geofence_assignments FOR DELETE
USING (is_branch_manager(auth.uid(), branch_id) OR is_super_admin(auth.uid()));

-- Staff can read their own assignments
CREATE POLICY "Staff can view own geofence assignments"
ON public.staff_geofence_assignments FOR SELECT
USING (auth.uid() = user_id);

-- 2. Add tracking columns to staff_attendance
ALTER TABLE public.staff_attendance
  ADD COLUMN IF NOT EXISTS is_outside_geofence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS selfie_url TEXT,
  ADD COLUMN IF NOT EXISTS geofence_note TEXT;
