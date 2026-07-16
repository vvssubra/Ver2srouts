
-- 1. Add exclude_from_payroll to staff_profiles
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS exclude_from_payroll BOOLEAN DEFAULT false;

-- 2. Create geofence_locations table
CREATE TABLE IF NOT EXISTS public.geofence_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.geofence_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can manage geofence locations" ON public.geofence_locations
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id)
  );

CREATE POLICY "Branch members can view geofence locations" ON public.geofence_locations
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_branch(auth.uid(), branch_id)
  );

-- 3. Add lat/lng columns to staff_attendance
ALTER TABLE public.staff_attendance ADD COLUMN IF NOT EXISTS clock_in_latitude DOUBLE PRECISION;
ALTER TABLE public.staff_attendance ADD COLUMN IF NOT EXISTS clock_in_longitude DOUBLE PRECISION;
ALTER TABLE public.staff_attendance ADD COLUMN IF NOT EXISTS clock_out_latitude DOUBLE PRECISION;
ALTER TABLE public.staff_attendance ADD COLUMN IF NOT EXISTS clock_out_longitude DOUBLE PRECISION;
