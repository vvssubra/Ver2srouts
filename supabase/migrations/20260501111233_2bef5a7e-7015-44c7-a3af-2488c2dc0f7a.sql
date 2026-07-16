-- 1. Clean up: remove existing parent rows from branch_memberships
DELETE FROM public.branch_memberships
WHERE user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'parent');

-- 2. Trigger to prevent parents from being added to branch_memberships in the future
CREATE OR REPLACE FUNCTION public.block_parent_branch_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'parent'
  ) THEN
    RAISE EXCEPTION 'Parents cannot be added to branch_memberships. Use parent_students instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_parent_branch_membership ON public.branch_memberships;
CREATE TRIGGER trg_block_parent_branch_membership
BEFORE INSERT OR UPDATE ON public.branch_memberships
FOR EACH ROW EXECUTE FUNCTION public.block_parent_branch_membership();

-- 3. Trigger to notify branch approvers when a parent self-links with pending status
CREATE OR REPLACE FUNCTION public.notify_pending_parent_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_student_name text;
  v_parent_name text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT s.branch_id, (s.first_name || ' ' || COALESCE(s.last_name, ''))
    INTO v_branch_id, v_student_name
  FROM public.students s WHERE s.id = NEW.student_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.first_name || ' ' || COALESCE(p.last_name, ''), 'A parent')
    INTO v_parent_name
  FROM public.profiles p WHERE p.id = NEW.parent_id;

  PERFORM public.notify_approvers(
    _branch_id      := v_branch_id,
    _exclude_user_id := NULL,
    _title          := 'Parent link request',
    _message        := COALESCE(v_parent_name, 'A parent') || ' is requesting access to ' || COALESCE(v_student_name, 'a student'),
    _type           := 'parent_link_request',
    _action_url     := '/students/' || NEW.student_id::text || '?tab=parents',
    _reference_id   := NEW.id::text,
    _group_key      := 'parent_link_' || NEW.id::text,
    _priority       := 'high'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_pending_parent_link ON public.parent_students;
CREATE TRIGGER trg_notify_pending_parent_link
AFTER INSERT ON public.parent_students
FOR EACH ROW EXECUTE FUNCTION public.notify_pending_parent_link();