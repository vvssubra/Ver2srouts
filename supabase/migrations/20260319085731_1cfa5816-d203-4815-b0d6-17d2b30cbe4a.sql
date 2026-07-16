-- Fix existing transaction sync function (uuid/text mismatch was causing invoice updates to fail)
CREATE OR REPLACE FUNCTION public.sync_invoice_to_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _account_id uuid;
  _student_name text;
BEGIN
  -- Invoice paid: create income transaction
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    _account_id := get_or_create_system_account(NEW.branch_id, 'revenue', 'SYS-REV', 'Tuition Revenue');

    SELECT first_name || ' ' || last_name INTO _student_name
    FROM students WHERE id = NEW.student_id;

    IF NOT EXISTS (
      SELECT 1
      FROM transactions
      WHERE reference_id = NEW.id
        AND reference_type = 'invoice'
    ) THEN
      INSERT INTO transactions (branch_id, account_id, type, amount, description, transaction_date, reference_type, reference_id, created_by, status)
      VALUES (
        NEW.branch_id,
        _account_id,
        'income',
        NEW.total_amount,
        'Invoice ' || NEW.invoice_number || ' — ' || COALESCE(_student_name, 'Student'),
        CURRENT_DATE,
        'invoice',
        NEW.id,
        NEW.created_by,
        'approved'
      );
    END IF;
  END IF;

  -- Invoice cancelled after being paid: remove the auto-created transaction
  IF NEW.status = 'cancelled' AND OLD.status = 'paid' THEN
    DELETE FROM transactions
    WHERE reference_id = OLD.id
      AND reference_type = 'invoice';
  END IF;

  RETURN NEW;
END;
$function$;

-- Validate payment writes to prevent duplicates/overpayments and serialize per invoice
CREATE OR REPLACE FUNCTION public.validate_payment_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

DROP TRIGGER IF EXISTS trg_validate_payment_before_write ON public.payments;
CREATE TRIGGER trg_validate_payment_before_write
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.validate_payment_before_write();

-- Keep invoice amount/status synchronized from payments after any write
CREATE OR REPLACE FUNCTION public.sync_invoice_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_total_amount NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_current_status TEXT;
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

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM public.payments
  WHERE invoice_id = v_invoice_id;

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

DROP TRIGGER IF EXISTS trg_sync_invoice_from_payments ON public.payments;
CREATE TRIGGER trg_sync_invoice_from_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_from_payments();

-- Clean historical duplicate payment references (keep earliest per invoice+reference)
WITH normalized AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY invoice_id, LOWER(BTRIM(payment_reference))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.payments
  WHERE payment_reference IS NOT NULL
    AND BTRIM(payment_reference) <> ''
),
to_delete AS (
  SELECT id
  FROM normalized
  WHERE rn > 1
)
DELETE FROM public.payments p
USING to_delete d
WHERE p.id = d.id;

-- Enforce unique receipt reference per invoice going forward
CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_reference_unique
ON public.payments (invoice_id, LOWER(BTRIM(payment_reference)))
WHERE payment_reference IS NOT NULL
  AND BTRIM(payment_reference) <> '';

-- Backfill invoice amount_paid/status from current payment totals
WITH payment_totals AS (
  SELECT i.id AS invoice_id,
         COALESCE(SUM(p.amount), 0) AS total_paid
  FROM public.invoices i
  LEFT JOIN public.payments p ON p.invoice_id = i.id
  GROUP BY i.id
)
UPDATE public.invoices i
SET amount_paid = pt.total_paid,
    status = CASE
      WHEN i.status = 'cancelled' THEN 'cancelled'
      WHEN pt.total_paid >= i.total_amount AND i.total_amount > 0 THEN 'paid'
      WHEN pt.total_paid > 0 THEN 'partial'
      WHEN i.status IN ('partial', 'paid', 'overdue') THEN 'issued'
      ELSE i.status
    END
FROM payment_totals pt
WHERE i.id = pt.invoice_id
  AND (
    i.amount_paid IS DISTINCT FROM pt.total_paid
    OR i.status IS DISTINCT FROM CASE
      WHEN i.status = 'cancelled' THEN 'cancelled'
      WHEN pt.total_paid >= i.total_amount AND i.total_amount > 0 THEN 'paid'
      WHEN pt.total_paid > 0 THEN 'partial'
      WHEN i.status IN ('partial', 'paid', 'overdue') THEN 'issued'
      ELSE i.status
    END
  );