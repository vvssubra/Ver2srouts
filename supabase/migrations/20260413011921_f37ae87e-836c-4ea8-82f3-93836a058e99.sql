
CREATE OR REPLACE FUNCTION public.sync_payment_to_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _account_id uuid;
  _invoice_number text;
  _student_name text;
  _branch_id uuid;
BEGIN
  SELECT i.invoice_number, i.branch_id,
         s.first_name || ' ' || s.last_name
  INTO _invoice_number, _branch_id, _student_name
  FROM invoices i
  LEFT JOIN students s ON s.id = i.student_id
  WHERE i.id = NEW.invoice_id;

  IF _branch_id IS NULL THEN
    _branch_id := NEW.branch_id;
  END IF;

  IF _branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE reference_id = NEW.id AND reference_type = 'payment'
  ) THEN
    RETURN NEW;
  END IF;

  _account_id := get_or_create_system_account(_branch_id, 'revenue', 'SYS-REV', 'Tuition Revenue');

  INSERT INTO transactions (
    branch_id, account_id, type, amount, description,
    transaction_date, reference_type, reference_id, created_by, status
  ) VALUES (
    _branch_id, _account_id, 'income', NEW.amount,
    'Payment received — ' || COALESCE(_invoice_number, 'Unallocated') || ' — ' || COALESCE(_student_name, 'Student'),
    CURRENT_DATE, 'payment', NEW.id,
    COALESCE(NEW.received_by, '00000000-0000-0000-0000-000000000000'::uuid),
    'approved'
  );

  RETURN NEW;
END;
$function$;
