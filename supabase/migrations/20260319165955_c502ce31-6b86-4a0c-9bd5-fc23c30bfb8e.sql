
-- 1. Payment allocations table (N:N between payments and invoices)
CREATE TABLE public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id),
  amount NUMERIC NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  allocated_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allocations in their branch"
ON public.payment_allocations FOR SELECT TO authenticated
USING (branch_id IN (SELECT branch_id FROM public.branch_memberships WHERE user_id = auth.uid()));

CREATE POLICY "Managers can insert allocations"
ON public.payment_allocations FOR INSERT TO authenticated
WITH CHECK (branch_id IN (SELECT branch_id FROM public.branch_memberships WHERE user_id = auth.uid()));

-- 3. Performance indexes
CREATE INDEX idx_payment_allocations_payment ON public.payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON public.payment_allocations(invoice_id);
CREATE INDEX idx_payment_allocations_batch ON public.payment_allocations(batch_id);
CREATE INDEX idx_payment_allocations_branch ON public.payment_allocations(branch_id);

-- 4. Modify validate_payment_before_write to allow NULL invoice_id (unallocated payments)
CREATE OR REPLACE FUNCTION public.validate_payment_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_existing_paid NUMERIC := 0;
  v_projected_paid NUMERIC := 0;
BEGIN
  -- Allow payments without invoice_id (unallocated / multi-invoice source)
  IF NEW.invoice_id IS NULL THEN
    IF NEW.amount IS NULL OR NEW.amount = 0 THEN
      RAISE EXCEPTION 'Payment amount cannot be zero.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT id, total_amount, status
  INTO v_invoice
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found for payment.';
  END IF;

  -- Allow negative amounts for reversal entries (compensating entries)
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF v_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'This invoice has been cancelled. Payments cannot be recorded.';
  END IF;

  IF v_invoice.status = 'paid' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'This invoice is already fully paid. No further payments can be recorded.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_existing_paid
    FROM public.payments p
    WHERE p.invoice_id = NEW.invoice_id;
  ELSE
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_existing_paid
    FROM public.payments p
    WHERE p.invoice_id = NEW.invoice_id
      AND p.id <> OLD.id;
  END IF;

  v_projected_paid := v_existing_paid + NEW.amount;

  IF v_projected_paid > v_invoice.total_amount + 0.00001 THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance.';
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Trigger on payment_allocations to recalculate invoice balance
-- Uses combined sum from direct payments + allocations (mutually exclusive by design)
CREATE OR REPLACE FUNCTION public.sync_invoice_from_allocations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice_id UUID;
  v_total_amount NUMERIC;
  v_current_status TEXT;
  v_direct_paid NUMERIC;
  v_allocated_paid NUMERIC;
  v_total_paid NUMERIC;
  v_new_status TEXT;
BEGIN
  v_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total_amount, status
  INTO v_total_amount, v_current_status
  FROM public.invoices
  WHERE id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sum from direct payments (where payment.invoice_id = this invoice)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_direct_paid
  FROM public.payments
  WHERE invoice_id = v_invoice_id;

  -- Sum from allocations (where allocation.invoice_id = this invoice)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_allocated_paid
  FROM public.payment_allocations
  WHERE invoice_id = v_invoice_id;

  -- Combined total (these are mutually exclusive by design)
  v_total_paid := v_direct_paid + v_allocated_paid;

  IF v_current_status = 'cancelled' THEN
    v_new_status := 'cancelled';
  ELSIF v_total_paid >= v_total_amount AND v_total_amount > 0 THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSIF v_current_status IN ('partial', 'paid', 'overdue') THEN
    v_new_status := 'issued';
  ELSE
    v_new_status := v_current_status;
  END IF;

  UPDATE public.invoices
  SET amount_paid = v_total_paid,
      status = v_new_status
  WHERE id = v_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER on_allocation_change
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_from_allocations();
