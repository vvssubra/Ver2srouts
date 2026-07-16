
-- Approval action types enum
CREATE TYPE public.approval_action_type AS ENUM (
  'payment_reversal',
  'refund',
  'discount_override',
  'write_off',
  'invoice_cancellation',
  'backdated_payment',
  'manual_wallet_adjustment',
  'due_date_override'
);

-- Approval request status enum
CREATE TYPE public.approval_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'escalated',
  'cancelled'
);

-- Approval rules table
CREATE TABLE public.approval_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  action_type approval_action_type NOT NULL,
  amount_threshold NUMERIC NOT NULL DEFAULT 0,
  required_approver_role app_role NOT NULL DEFAULT 'super_admin',
  requires_second_approval BOOLEAN NOT NULL DEFAULT false,
  second_approver_role app_role,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval requests table
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  action_type approval_action_type NOT NULL,
  status approval_request_status NOT NULL DEFAULT 'pending',
  requester_id UUID NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  request_summary TEXT NOT NULL,
  request_details JSONB,
  supporting_notes TEXT,
  financial_impact_preview JSONB,
  priority TEXT NOT NULL DEFAULT 'normal',
  matched_rule_id UUID REFERENCES public.approval_rules(id),
  current_step INTEGER NOT NULL DEFAULT 1,
  max_steps INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approval decisions table (audit trail)
CREATE TABLE public.approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  decision TEXT NOT NULL,
  decided_by UUID NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT,
  conditions TEXT
);

-- Indexes
CREATE INDEX idx_approval_rules_branch ON public.approval_rules(branch_id);
CREATE INDEX idx_approval_rules_action ON public.approval_rules(action_type);
CREATE INDEX idx_approval_requests_branch ON public.approval_requests(branch_id);
CREATE INDEX idx_approval_requests_status ON public.approval_requests(status);
CREATE INDEX idx_approval_requests_entity ON public.approval_requests(entity_type, entity_id);
CREATE INDEX idx_approval_decisions_request ON public.approval_decisions(request_id);

-- Enable RLS
ALTER TABLE public.approval_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

-- RLS: approval_rules (branch managers can manage)
CREATE POLICY "Branch managers can view approval rules"
  ON public.approval_rules FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR branch_id IS NULL
  );

CREATE POLICY "Super admins and branch managers can manage approval rules"
  ON public.approval_rules FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
  );

-- RLS: approval_requests (branch-scoped access)
CREATE POLICY "Branch staff can view approval requests"
  ON public.approval_requests FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR requester_id = auth.uid()
  );

CREATE POLICY "Authenticated users can create approval requests"
  ON public.approval_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND public.is_member_of_branch(auth.uid(), branch_id)
  );

CREATE POLICY "Branch managers can update approval requests"
  ON public.approval_requests FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR requester_id = auth.uid()
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
    OR requester_id = auth.uid()
  );

-- RLS: approval_decisions
CREATE POLICY "Branch staff can view approval decisions"
  ON public.approval_decisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.is_branch_manager(auth.uid(), ar.branch_id)
        OR ar.requester_id = auth.uid()
      )
    )
  );

CREATE POLICY "Approvers can insert decisions"
  ON public.approval_decisions FOR INSERT TO authenticated
  WITH CHECK (
    decided_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.approval_requests ar
      WHERE ar.id = request_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.is_branch_manager(auth.uid(), ar.branch_id)
      )
    )
  );
