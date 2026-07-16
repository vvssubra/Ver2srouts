CREATE OR REPLACE FUNCTION public.block_parent_branch_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block only if the user is exclusively a parent (no other role).
  -- Users who are both parent AND staff (teacher/admin/etc.) are allowed.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role = 'parent'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = NEW.user_id AND role <> 'parent'
  ) THEN
    RAISE EXCEPTION 'Parents cannot be added to branch_memberships. Use parent_students instead.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;