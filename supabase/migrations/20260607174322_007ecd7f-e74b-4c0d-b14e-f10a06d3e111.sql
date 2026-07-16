
ALTER TABLE public.approval_routing ADD COLUMN IF NOT EXISTS l2_disabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.resolve_approvers(_user_id uuid, _workflow text)
 RETURNS TABLE(l1_approver uuid, l2_approver uuid, notify_submit uuid[], notify_decision uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_route public.approval_routing%ROWTYPE;
  v_reports_to uuid;
  v_branch_id uuid;
  v_branch_manager uuid;
  v_super_admin uuid;
  v_l1 uuid;
  v_l2 uuid;
  v_chain uuid[];
BEGIN
  SELECT * INTO v_route FROM public.approval_routing
    WHERE user_id = _user_id AND workflow = _workflow LIMIT 1;

  SELECT reports_to INTO v_reports_to FROM public.staff_profiles
    WHERE user_id = _user_id LIMIT 1;

  SELECT bm.branch_id INTO v_branch_id FROM public.branch_memberships bm
    WHERE bm.user_id = _user_id LIMIT 1;

  IF v_branch_id IS NOT NULL THEN
    SELECT ur.user_id INTO v_branch_manager
      FROM public.user_roles ur
      JOIN public.branch_memberships bm ON bm.user_id = ur.user_id
     WHERE ur.role = 'franchisee' AND bm.branch_id = v_branch_id
     LIMIT 1;
  END IF;

  SELECT user_id INTO v_super_admin FROM public.user_roles
    WHERE role = 'super_admin' LIMIT 1;

  v_l1 := COALESCE(v_route.l1_approver_id, v_reports_to, v_branch_manager, v_super_admin);

  IF COALESCE(v_route.l2_disabled, false) THEN
    v_l2 := NULL;
  ELSE
    v_l2 := COALESCE(v_route.l2_approver_id, v_branch_manager, v_super_admin);
  END IF;

  v_chain := ARRAY[]::uuid[];
  IF v_l1 IS NOT NULL THEN v_chain := array_append(v_chain, v_l1); END IF;
  IF v_l2 IS NOT NULL AND v_l2 <> v_l1 THEN v_chain := array_append(v_chain, v_l2); END IF;

  RETURN QUERY SELECT
    v_l1,
    v_l2,
    COALESCE(NULLIF(v_route.notify_on_submit, ARRAY[]::uuid[]), v_chain),
    COALESCE(NULLIF(v_route.notify_on_decision, ARRAY[]::uuid[]), ARRAY[_user_id] || v_chain);
END;
$function$;
