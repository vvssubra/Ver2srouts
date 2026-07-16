
-- Payment disputes / reversal requests table
CREATE TABLE public.payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id),
  invoice_id UUID REFERENCES public.invoices(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  
  -- Dispute details
  dispute_type TEXT NOT NULL DEFAULT 'reversal_request',
  reason TEXT NOT NULL,
  reason_code TEXT NOT NULL DEFAULT 'other',
  disputed_amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  
  -- BillPlz / gateway integration
  gateway_dispute_id TEXT,
  gateway_status TEXT,
  
  -- Actor tracking
  requested_by UUID NOT NULL,
  requested_by_name TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_disputes ENABLE ROW LEVEL SECURITY;

-- RLS: Branch members can read disputes in their branch
CREATE POLICY "Branch members can read disputes"
  ON public.payment_disputes
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_member_of_branch(auth.uid(), branch_id)
  );

-- RLS: Authenticated users can create disputes
CREATE POLICY "Authenticated users can create disputes"
  ON public.payment_disputes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_member_of_branch(auth.uid(), branch_id)
  );

-- RLS: Branch managers can update disputes
CREATE POLICY "Branch managers can update disputes"
  ON public.payment_disputes
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_branch_manager(auth.uid(), branch_id)
  );

-- Index for common queries
CREATE INDEX idx_payment_disputes_payment ON public.payment_disputes(payment_id);
CREATE INDEX idx_payment_disputes_branch_status ON public.payment_disputes(branch_id, status);
CREATE INDEX idx_payment_disputes_invoice ON public.payment_disputes(invoice_id);
