
CREATE TABLE public.staff_attendance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid REFERENCES public.staff_attendance(id) ON DELETE SET NULL,
  action text NOT NULL,
  changed_by uuid NOT NULL,
  reason text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.staff_attendance_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins and franchisees can read audit logs"
ON public.staff_attendance_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'franchisee')
);

CREATE POLICY "Authenticated users can insert audit logs"
ON public.staff_attendance_audit_log
FOR INSERT
TO authenticated
WITH CHECK (changed_by = auth.uid());
