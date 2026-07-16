
-- Gateway Events: idempotent webhook event log
CREATE TABLE public.gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) NOT NULL,
  gateway text NOT NULL DEFAULT 'billplz',
  event_type text NOT NULL,
  event_id text NOT NULL,
  bill_id text,
  collection_id text,
  invoice_id uuid REFERENCES public.invoices(id),
  payment_id uuid REFERENCES public.payments(id),
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'pending',
  processing_error text,
  processed_at timestamptz,
  retry_count integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_gateway_idempotency UNIQUE (idempotency_key)
);

-- Gateway Transactions: BillPlz-specific metadata linked to payments
CREATE TABLE public.gateway_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.payments(id) NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  branch_id uuid REFERENCES public.branches(id) NOT NULL,
  gateway text NOT NULL DEFAULT 'billplz',
  bill_id text NOT NULL,
  collection_id text,
  transaction_reference text,
  gateway_status text NOT NULL DEFAULT 'pending',
  gateway_amount numeric NOT NULL DEFAULT 0,
  gateway_paid_at timestamptz,
  settlement_status text DEFAULT 'pending',
  settlement_date date,
  settlement_reference text,
  reconciliation_status text NOT NULL DEFAULT 'unmatched',
  reconciliation_notes text,
  reconciled_at timestamptz,
  reconciled_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_gateway_events_branch ON public.gateway_events(branch_id);
CREATE INDEX idx_gateway_events_bill ON public.gateway_events(bill_id);
CREATE INDEX idx_gateway_events_status ON public.gateway_events(processing_status);
CREATE INDEX idx_gateway_events_created ON public.gateway_events(created_at DESC);
CREATE INDEX idx_gateway_transactions_payment ON public.gateway_transactions(payment_id);
CREATE INDEX idx_gateway_transactions_bill ON public.gateway_transactions(bill_id);
CREATE INDEX idx_gateway_transactions_recon ON public.gateway_transactions(reconciliation_status);
CREATE INDEX idx_gateway_transactions_branch ON public.gateway_transactions(branch_id);

-- RLS
ALTER TABLE public.gateway_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gateway_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can view gateway events"
  ON public.gateway_events FOR SELECT TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Branch managers can view gateway transactions"
  ON public.gateway_transactions FOR SELECT TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Service can insert gateway events"
  ON public.gateway_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service can insert gateway transactions"
  ON public.gateway_transactions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Branch managers can update gateway transactions"
  ON public.gateway_transactions FOR UPDATE TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id));
