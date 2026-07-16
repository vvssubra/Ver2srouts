
-- Drop the old table with lat/lng/radius columns
DROP TABLE IF EXISTS public.staff_geofence_assignments;

-- Recreate as a clean junction table
CREATE TABLE public.staff_geofence_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  geofence_location_id UUID NOT NULL REFERENCES public.geofence_locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, geofence_location_id)
);

ALTER TABLE public.staff_geofence_assignments ENABLE ROW LEVEL SECURITY;

-- Branch managers can manage assignments
CREATE POLICY "Branch managers can manage geofence assignments"
ON public.staff_geofence_assignments
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.is_branch_manager(auth.uid(), branch_id)
);

-- Staff can read their own assignments
CREATE POLICY "Staff can view own geofence assignments"
ON public.staff_geofence_assignments
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
