
-- Fix: Allow negative payment amounts for reversals
-- The original trigger blocks amount <= 0, preventing immutable reversal entries
CREATE OR REPLACE FUNCTION public.validate_payment_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_existing_paid NUMERIC := 0;
  v_projected_paid NUMERIC := 0;
BEGIN
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
$function$;
