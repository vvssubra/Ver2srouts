
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'parent';
ALTER TABLE public.newsletters   ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'parent';

CREATE OR REPLACE FUNCTION public.validate_audience_value()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.audience NOT IN ('parent','staff','both') THEN
    RAISE EXCEPTION 'Invalid audience: %. Must be parent, staff, or both.', NEW.audience;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_announcement_audience ON public.announcements;
CREATE TRIGGER validate_announcement_audience
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.validate_audience_value();

DROP TRIGGER IF EXISTS validate_newsletter_audience ON public.newsletters;
CREATE TRIGGER validate_newsletter_audience
  BEFORE INSERT OR UPDATE ON public.newsletters
  FOR EACH ROW EXECUTE FUNCTION public.validate_audience_value();

CREATE OR REPLACE FUNCTION public.can_manage_route(_user_id uuid, _route text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'super_admin'::app_role)
    OR public.has_role(_user_id, 'franchisee'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.access_group_members agm
      JOIN public.access_groups ag ON ag.id = agm.group_id
      WHERE agm.user_id = _user_id AND ag.is_active = true AND _route = ANY(ag.managed_routes)
    )
$$;

DROP POLICY IF EXISTS "Managers can manage holidays" ON public.school_holidays;
CREATE POLICY "Managers manage school holidays" ON public.school_holidays
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.academic_years ay
  WHERE ay.id = school_holidays.academic_year_id
    AND public.is_member_of_branch(auth.uid(), ay.branch_id)
    AND public.can_manage_route(auth.uid(), '/hr-calendar')))
WITH CHECK (EXISTS (SELECT 1 FROM public.academic_years ay
  WHERE ay.id = school_holidays.academic_year_id
    AND public.is_member_of_branch(auth.uid(), ay.branch_id)
    AND public.can_manage_route(auth.uid(), '/hr-calendar')));

DROP POLICY IF EXISTS "Branch members manage branch events" ON public.branch_events;
DROP POLICY IF EXISTS "Managers manage branch events" ON public.branch_events;
CREATE POLICY "Managers manage branch events" ON public.branch_events
FOR ALL TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/hr-calendar'))
WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/hr-calendar'));

DROP POLICY IF EXISTS "Branch members manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Managers manage announcements" ON public.announcements;
CREATE POLICY "Managers manage announcements" ON public.announcements
FOR ALL TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/announcements'))
WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/announcements'));

DROP POLICY IF EXISTS "Branch members manage newsletters" ON public.newsletters;
DROP POLICY IF EXISTS "Managers manage newsletters" ON public.newsletters;
CREATE POLICY "Managers manage newsletters" ON public.newsletters
FOR ALL TO authenticated
USING (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/newsletters'))
WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id) AND public.can_manage_route(auth.uid(), '/newsletters'));

-- Seed Marketing access group per branch
INSERT INTO public.access_groups (name, description, branch_id, allowed_routes, managed_routes, is_active)
SELECT 'Marketing',
       'Manages parent-facing announcements, newsletters, and CRM (read-only).',
       b.id,
       ARRAY['/announcements','/newsletters','/staff-inbox','/crm','/help','/notifications','/settings']::text[],
       ARRAY['/announcements','/newsletters']::text[],
       true
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.access_groups ag WHERE ag.name = 'Marketing' AND ag.branch_id = b.id
);

UPDATE public.access_groups
SET allowed_routes = array_remove(allowed_routes, '/dashboard')
WHERE name = 'Operations';
