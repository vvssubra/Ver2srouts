
-- ============================================================
-- Approval Routing & Unified Approver Resolution
-- ============================================================

-- 1) approval_settings: add SLA escalation hours per workflow
ALTER TABLE public.approval_settings
  ADD COLUMN IF NOT EXISTS sla_leave_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS sla_ot_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS sla_claim_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS sla_payroll_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS auto_cc_reporting_chain boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_cc_depth integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delegate_on_leave boolean NOT NULL DEFAULT true;

-- 2) Per-staff approval routing overrides
CREATE TABLE IF NOT EXISTS public.approval_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workflow text NOT NULL CHECK (workflow IN ('leave','ot','claim','payroll','attendance')),
  l1_approver_id uuid,
  l2_approver_id uuid,
  notify_on_submit uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  notify_on_decision uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workflow)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_routing TO authenticated;
GRANT ALL ON public.approval_routing TO service_role;

ALTER TABLE public.approval_routing ENABLE ROW LEVEL SECURITY;

-- Staff can view their own routing
CREATE POLICY "Staff view own routing"
  ON public.approval_routing FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins / branch managers / super admins can view and manage all routing
CREATE POLICY "Admins manage routing"
  ON public.approval_routing FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'franchisee') OR
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'franchisee') OR
    public.has_role(auth.uid(), 'admin')
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS approval_routing_touch ON public.approval_routing;
CREATE TRIGGER approval_routing_touch BEFORE UPDATE ON public.approval_routing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Unified resolver: returns who approves L1/L2 and who should be notified
CREATE OR REPLACE FUNCTION public.resolve_approvers(
  _user_id uuid,
  _workflow text
)
RETURNS TABLE (
  l1_approver uuid,
  l2_approver uuid,
  notify_submit uuid[],
  notify_decision uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Per-staff override has highest precedence
  SELECT * INTO v_route FROM public.approval_routing
    WHERE user_id = _user_id AND workflow = _workflow LIMIT 1;

  -- reports_to fallback
  SELECT reports_to INTO v_reports_to FROM public.staff_profiles
    WHERE user_id = _user_id LIMIT 1;

  -- Branch manager fallback
  SELECT bm.branch_id INTO v_branch_id FROM public.branch_memberships bm
    WHERE bm.user_id = _user_id LIMIT 1;

  IF v_branch_id IS NOT NULL THEN
    SELECT ur.user_id INTO v_branch_manager
      FROM public.user_roles ur
      JOIN public.branch_memberships bm ON bm.user_id = ur.user_id
     WHERE ur.role = 'franchisee' AND bm.branch_id = v_branch_id
     LIMIT 1;
  END IF;

  -- Super admin fallback (any one)
  SELECT user_id INTO v_super_admin FROM public.user_roles
    WHERE role = 'super_admin' LIMIT 1;

  v_l1 := COALESCE(v_route.l1_approver_id, v_reports_to, v_branch_manager, v_super_admin);
  v_l2 := COALESCE(v_route.l2_approver_id, v_branch_manager, v_super_admin);

  -- Build reporting chain (up to 3 levels) for auto-CC
  v_chain := ARRAY[]::uuid[];
  IF v_l1 IS NOT NULL THEN v_chain := array_append(v_chain, v_l1); END IF;
  IF v_l2 IS NOT NULL AND v_l2 <> v_l1 THEN v_chain := array_append(v_chain, v_l2); END IF;

  RETURN QUERY SELECT
    v_l1,
    v_l2,
    COALESCE(NULLIF(v_route.notify_on_submit, ARRAY[]::uuid[]), v_chain),
    COALESCE(NULLIF(v_route.notify_on_decision, ARRAY[]::uuid[]), ARRAY[_user_id] || v_chain);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_approvers(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_approvers(uuid, text) TO service_role;
