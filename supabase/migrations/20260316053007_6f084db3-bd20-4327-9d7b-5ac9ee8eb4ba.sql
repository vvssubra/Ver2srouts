
-- 1. Add probation and work_schedule columns to staff_profiles
ALTER TABLE public.staff_profiles 
  ADD COLUMN IF NOT EXISTS probation_duration_months integer,
  ADD COLUMN IF NOT EXISTS probation_end_date date,
  ADD COLUMN IF NOT EXISTS probation_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS probation_extended_until date,
  ADD COLUMN IF NOT EXISTS work_schedule jsonb;

-- 2. Admin INSERT policy for staff_profiles
CREATE POLICY "Admins can insert branch staff profiles"
ON public.staff_profiles FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.branch_memberships bm1
    JOIN public.branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_profiles.user_id
  )
);

-- 3. Admin UPDATE policy for staff_profiles
CREATE POLICY "Admins can update branch staff profiles"
ON public.staff_profiles FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) AND
  EXISTS (
    SELECT 1 FROM public.branch_memberships bm1
    JOIN public.branch_memberships bm2 ON bm1.branch_id = bm2.branch_id
    WHERE bm1.user_id = auth.uid() AND bm2.user_id = staff_profiles.user_id
  )
);

-- 4. Probation notification trigger function
CREATE OR REPLACE FUNCTION public.notify_probation_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _staff_name text;
  _manager_id uuid;
BEGIN
  -- Only act when probation_status is 'ongoing' and end date is within 14 days or past
  IF NEW.probation_status = 'ongoing' AND NEW.probation_end_date IS NOT NULL 
     AND NEW.probation_end_date <= (CURRENT_DATE + INTERVAL '14 days') THEN
    
    -- Get staff name
    SELECT first_name || ' ' || last_name INTO _staff_name
    FROM public.profiles WHERE id = NEW.user_id;

    -- Notify reports_to manager
    _manager_id := NEW.reports_to;
    IF _manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
      VALUES (_manager_id, 'Probation Ending Soon',
        COALESCE(_staff_name, 'A staff member') || '''s probation ends on ' || NEW.probation_end_date::text || '. Please review and confirm or extend.',
        'probation_reminder', NEW.user_id::text, '/staff-management/' || NEW.user_id::text)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Notify all super_admins
    INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
    SELECT ur.user_id, 'Probation Ending Soon',
      COALESCE(_staff_name, 'A staff member') || '''s probation ends on ' || NEW.probation_end_date::text || '.',
      'probation_reminder', NEW.user_id::text, '/staff-management/' || NEW.user_id::text
    FROM public.user_roles ur WHERE ur.role = 'super_admin';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Create trigger
DROP TRIGGER IF EXISTS trg_probation_expiry ON public.staff_profiles;
CREATE TRIGGER trg_probation_expiry
  AFTER INSERT OR UPDATE OF probation_status, probation_end_date ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_probation_expiry();
