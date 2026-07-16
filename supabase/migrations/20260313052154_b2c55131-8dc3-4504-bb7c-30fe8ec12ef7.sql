
-- Approval settings: global defaults + per-branch overrides
CREATE TABLE public.approval_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  -- NULL branch_id = global default, non-null = branch override
  
  -- Claims
  claims_l2_enabled boolean NOT NULL DEFAULT true,
  claims_l2_threshold numeric NOT NULL DEFAULT 500,
  -- If claim amount > threshold AND l2_enabled, require L2
  
  -- Leave
  leave_l2_enabled boolean NOT NULL DEFAULT false,
  
  -- Overtime
  ot_l2_enabled boolean NOT NULL DEFAULT false,
  
  -- L1 routing
  use_reports_to boolean NOT NULL DEFAULT true,
  -- true = route to reports_to supervisor first, fallback to any branch manager
  -- false = any branch manager can approve
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(branch_id)
);

-- Allow NULL branch_id for global default (unique constraint allows one null via unique index)
CREATE UNIQUE INDEX approval_settings_global_idx ON public.approval_settings ((true)) WHERE branch_id IS NULL;

ALTER TABLE public.approval_settings ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all settings
CREATE POLICY "Super admins manage approval settings"
ON public.approval_settings FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Branch managers can view their branch settings + global
CREATE POLICY "Branch managers view approval settings"
ON public.approval_settings FOR SELECT
TO authenticated
USING (
  branch_id IS NULL 
  OR public.is_branch_manager(auth.uid(), branch_id)
);

-- Insert global default
INSERT INTO public.approval_settings (branch_id, claims_l2_enabled, claims_l2_threshold, leave_l2_enabled, ot_l2_enabled, use_reports_to)
VALUES (NULL, true, 500, false, false, true);

-- Helper function to get effective approval settings for a branch
CREATE OR REPLACE FUNCTION public.get_approval_settings(_branch_id uuid)
RETURNS public.approval_settings
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT a FROM approval_settings a WHERE a.branch_id = _branch_id LIMIT 1),
    (SELECT a FROM approval_settings a WHERE a.branch_id IS NULL LIMIT 1)
  );
$$;
