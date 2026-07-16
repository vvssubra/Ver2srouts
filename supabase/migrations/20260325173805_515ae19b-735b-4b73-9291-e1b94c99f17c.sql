
-- Create a function + trigger to notify relevant users when timetable slots change
CREATE OR REPLACE FUNCTION public.notify_timetable_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _class_name text;
  _branch_id uuid;
  _action_label text;
  _slot_date text;
  _subject text;
  _teacher record;
BEGIN
  -- Determine branch and details
  IF TG_OP = 'DELETE' THEN
    _branch_id := OLD.branch_id;
    _slot_date := OLD.slot_date::text;
    _subject := OLD.subject_name;
    _action_label := 'removed';
  ELSE
    _branch_id := NEW.branch_id;
    _slot_date := NEW.slot_date::text;
    _subject := NEW.subject_name;
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_modified, false) = false THEN
      -- Skip auto-publish bulk inserts (not manual)
      RETURN COALESCE(NEW, OLD);
    END IF;
    _action_label := CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'updated' END;
  END IF;

  -- Get class name
  SELECT class_name INTO _class_name
  FROM public.classes
  WHERE id = COALESCE(NEW.class_id, OLD.class_id)
  LIMIT 1;

  -- Notify super_admins
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
  SELECT ur.user_id,
    'Timetable ' || initcap(_action_label),
    _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
    'timetable_change',
    COALESCE(NEW.id, OLD.id),
    '/timetables'
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin';

  -- Notify branch managers / admins (franchisee + admin roles in branch)
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
  SELECT DISTINCT bm.user_id,
    'Timetable ' || initcap(_action_label),
    _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
    'timetable_change',
    COALESCE(NEW.id, OLD.id),
    '/timetables'
  FROM public.branch_memberships bm
  JOIN public.user_roles ur ON ur.user_id = bm.user_id
  WHERE bm.branch_id = _branch_id
    AND ur.role IN ('franchisee', 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = bm.user_id AND ur2.role = 'super_admin');

  -- Notify teachers assigned to this class
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
  SELECT DISTINCT bm.user_id,
    'Timetable ' || initcap(_action_label),
    _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
    'timetable_change',
    COALESCE(NEW.id, OLD.id),
    '/timetables'
  FROM public.branch_memberships bm
  JOIN public.user_roles ur ON ur.user_id = bm.user_id
  WHERE bm.branch_id = _branch_id
    AND ur.role = 'teacher'
    AND (
      bm.assigned_class_ids IS NULL
      OR COALESCE(NEW.class_id, OLD.class_id) = ANY(bm.assigned_class_ids)
    )
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = bm.user_id AND ur2.role IN ('super_admin', 'franchisee', 'admin'));

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach trigger for INSERT (manual only via is_modified check), UPDATE, DELETE
CREATE TRIGGER trg_notify_timetable_change
AFTER INSERT OR UPDATE OR DELETE ON public.daily_timetable_slots
FOR EACH ROW EXECUTE FUNCTION public.notify_timetable_change();
