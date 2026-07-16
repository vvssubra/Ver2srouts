
CREATE OR REPLACE FUNCTION public.notify_payment_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _parent_email text;
  _parent_name text;
  _student_name text;
  _invoice record;
  _balance numeric;
BEGIN
  IF NEW.amount <= 0 OR NEW.invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT i.invoice_number, i.total_amount, i.amount_paid, i.student_id
    INTO _invoice
  FROM public.invoices i WHERE i.id = NEW.invoice_id;

  IF _invoice.student_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.email,
         COALESCE(p.first_name,''),
         s.first_name
    INTO _parent_email, _parent_name, _student_name
  FROM public.students s
  LEFT JOIN public.parent_students ps ON ps.student_id = s.id AND ps.status = 'approved'
  LEFT JOIN public.profiles p ON p.id = ps.parent_id
  WHERE s.id = _invoice.student_id
  LIMIT 1;

  IF _parent_email IS NULL OR _parent_email = '' THEN RETURN NEW; END IF;

  -- invoice.amount_paid has NOT yet been synced with this new payment row
  -- (sync trigger runs after this one), so subtract NEW.amount explicitly.
  _balance := GREATEST(
    COALESCE(_invoice.total_amount,0)
      - COALESCE(_invoice.amount_paid,0)
      - COALESCE(NEW.amount,0),
    0
  );

  PERFORM public.dispatch_transactional_email(
    'invoice-receipt',
    _parent_email,
    jsonb_build_object(
      'parentName', _parent_name,
      'childName', _student_name,
      'invoiceNumber', _invoice.invoice_number,
      'amountPaid', to_char(NEW.amount, 'FM999,999,990.00'),
      'currency', 'RM',
      'balance', to_char(_balance, 'FM999,999,990.00'),
      'paymentMethod', COALESCE(NEW.payment_method, ''),
      'paymentDate', to_char(COALESCE(NEW.payment_date, CURRENT_DATE), 'DD Mon YYYY'),
      'receiptUrl', 'https://sprouts.littlegreenhearts.com/parent-fees'
    ),
    'invoice-receipt-' || NEW.id::text
  );
  RETURN NEW;
END;
$$;
