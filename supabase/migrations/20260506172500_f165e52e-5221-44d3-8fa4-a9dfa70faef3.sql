
-- Custom leave: SECURITY DEFINER assign RPC + auto-provision trigger + backfill

-- 1. SECURITY DEFINER assign RPC (returns affected row count)
CREATE OR REPLACE FUNCTION public.assign_custom_leave_balances(
  _type_id uuid,
  _branch_id uuid,
  _year integer,
  _user_ids uuid[],
  _total integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid;
  _count integer := 0;
BEGIN
  -- Authz: super admin or branch manager
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), _branch_id)) THEN
    RAISE EXCEPTION 'Not authorized to assign leave for this branch';
  END IF;

  IF _user_ids IS NULL OR array_length(_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOREACH _uid IN ARRAY _user_ids LOOP
    INSERT INTO public.custom_leave_balances(user_id, branch_id, custom_leave_type_id, year, total, used)
    VALUES (_uid, _branch_id, _type_id, _year, _total, 0)
    ON CONFLICT (user_id, custom_leave_type_id, year)
    DO UPDATE SET total = EXCLUDED.total, updated_at = now();
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 2. Auto-provision when staff added to branch
CREATE OR REPLACE FUNCTION public.provision_custom_leave_for_new_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _is_parent boolean;
  _yr integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'parent')
    INTO _is_parent;
  IF _is_parent THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.custom_leave_balances(user_id, branch_id, custom_leave_type_id, year, total, used)
  SELECT NEW.user_id, NEW.branch_id, t.id, _yr, t.default_days, 0
  FROM public.custom_leave_types t
  WHERE t.branch_id = NEW.branch_id AND t.is_active = true
  ON CONFLICT (user_id, custom_leave_type_id, year) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_custom_leave_for_new_member ON public.branch_memberships;
CREATE TRIGGER trg_provision_custom_leave_for_new_member
AFTER INSERT ON public.branch_memberships
FOR EACH ROW EXECUTE FUNCTION public.provision_custom_leave_for_new_member();

-- 3. Backfill: ensure every existing non-parent staff has a balance row for every active type
INSERT INTO public.custom_leave_balances(user_id, branch_id, custom_leave_type_id, year, total, used)
SELECT bm.user_id, bm.branch_id, t.id, EXTRACT(YEAR FROM CURRENT_DATE)::int, t.default_days, 0
FROM public.branch_memberships bm
JOIN public.custom_leave_types t ON t.branch_id = bm.branch_id AND t.is_active = true
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = bm.user_id AND ur.role = 'parent')
ON CONFLICT (user_id, custom_leave_type_id, year) DO NOTHING;
