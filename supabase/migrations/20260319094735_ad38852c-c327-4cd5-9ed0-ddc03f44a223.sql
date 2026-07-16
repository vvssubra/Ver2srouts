
-- Re-attach the validation trigger (BEFORE INSERT OR UPDATE on payments)
DROP TRIGGER IF EXISTS trg_validate_payment_before_write ON public.payments;
CREATE TRIGGER trg_validate_payment_before_write
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_before_write();

-- Re-attach the sync trigger (AFTER INSERT, UPDATE, DELETE on payments)
DROP TRIGGER IF EXISTS trg_sync_invoice_from_payments ON public.payments;
CREATE TRIGGER trg_sync_invoice_from_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_from_payments();

-- Re-attach invoice-to-transaction sync trigger
DROP TRIGGER IF EXISTS trg_sync_invoice_to_transaction ON public.invoices;
CREATE TRIGGER trg_sync_invoice_to_transaction
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_to_transaction();

-- Re-create unique index to prevent duplicate payment references per invoice
DROP INDEX IF EXISTS idx_unique_payment_ref_per_invoice;
CREATE UNIQUE INDEX idx_unique_payment_ref_per_invoice
  ON public.payments (invoice_id, LOWER(BTRIM(payment_reference)))
  WHERE payment_reference IS NOT NULL AND BTRIM(payment_reference) != '';

-- Backfill: recalculate amount_paid and status for ALL invoices from actual payments
UPDATE public.invoices inv
SET amount_paid = COALESCE(sub.total_paid, 0),
    status = CASE
      WHEN inv.status = 'cancelled' THEN 'cancelled'
      WHEN inv.status = 'draft' THEN 'draft'
      WHEN COALESCE(sub.total_paid, 0) >= inv.total_amount AND inv.total_amount > 0 THEN 'paid'
      WHEN COALESCE(sub.total_paid, 0) > 0 THEN 'partial'
      WHEN inv.status IN ('paid', 'partial') THEN 'issued'
      ELSE inv.status
    END
FROM (
  SELECT invoice_id, SUM(amount) AS total_paid
  FROM public.payments
  GROUP BY invoice_id
) sub
WHERE inv.id = sub.invoice_id
  AND (inv.amount_paid IS DISTINCT FROM COALESCE(sub.total_paid, 0)
       OR (COALESCE(sub.total_paid, 0) >= inv.total_amount AND inv.status NOT IN ('paid', 'cancelled', 'draft'))
       OR (COALESCE(sub.total_paid, 0) > 0 AND COALESCE(sub.total_paid, 0) < inv.total_amount AND inv.status NOT IN ('partial', 'cancelled', 'draft'))
      );

-- Fix invoices with no payments but wrong status
UPDATE public.invoices inv
SET amount_paid = 0,
    status = CASE WHEN inv.status = 'cancelled' THEN 'cancelled' WHEN inv.status = 'draft' THEN 'draft' ELSE 'issued' END
WHERE inv.status IN ('paid', 'partial')
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = inv.id);
