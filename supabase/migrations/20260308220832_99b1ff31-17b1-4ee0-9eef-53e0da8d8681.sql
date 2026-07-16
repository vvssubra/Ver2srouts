
-- Create payment_reversals table
CREATE TABLE public.payment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  branch_id UUID NOT NULL,
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

-- Enable RLS
ALTER TABLE public.payment_reversals ENABLE ROW LEVEL SECURITY;

-- Branch members can view reversals
CREATE POLICY "Branch members view reversals"
  ON public.payment_reversals FOR SELECT
  TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

-- Branch members can request reversals (insert)
CREATE POLICY "Branch members request reversals"
  ON public.payment_reversals FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND is_member_of_branch(auth.uid(), branch_id)
  );

-- Franchisees can update (approve/reject) reversals in their branch
CREATE POLICY "Franchisees manage reversals"
  ON public.payment_reversals FOR UPDATE
  TO authenticated
  USING (
    (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id))
  );

-- Super admins manage all reversals
CREATE POLICY "Super admins manage reversals"
  ON public.payment_reversals FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));
