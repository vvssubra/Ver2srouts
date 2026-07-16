
-- Fix sync_payment_to_transaction to use UUID properly
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
    COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    'approved'
  );

  RETURN NEW;
END;
$function$;

-- Fix sync_payroll_to_transaction: use reference_type variants instead of text suffix
CREATE OR REPLACE FUNCTION public.sync_payroll_to_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _account_id uuid;
  _staff_name text;
  _month_label text;
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = NEW.id AND reference_type = 'payroll_paid'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT first_name || ' ' || last_name INTO _staff_name
    FROM profiles WHERE id = NEW.user_id;

    _month_label := to_char(make_date(NEW.year, NEW.month, 1), 'Mon YYYY');
    _account_id := get_or_create_system_account(NEW.branch_id, 'expense', 'SYS-PAY', 'Payroll Expense');

    INSERT INTO transactions (
      branch_id, account_id, type, amount, description,
      transaction_date, reference_type, reference_id, created_by, status
    ) VALUES (
      NEW.branch_id, _account_id, 'expense',
      COALESCE(NEW.net_salary, 0),
      'Salary — ' || COALESCE(_staff_name, 'Staff') || ' (' || _month_label || ')',
      CURRENT_DATE, 'payroll_paid', NEW.id,
      COALESCE(NEW.approved_by, NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  IF NEW.status = 'reversed' AND (OLD.status IS NULL OR OLD.status != 'reversed') THEN
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = NEW.id AND reference_type = 'payroll_reversed'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT first_name || ' ' || last_name INTO _staff_name
    FROM profiles WHERE id = NEW.user_id;

    _month_label := to_char(make_date(NEW.year, NEW.month, 1), 'Mon YYYY');
    _account_id := get_or_create_system_account(NEW.branch_id, 'expense', 'SYS-PAY', 'Payroll Expense');

    INSERT INTO transactions (
      branch_id, account_id, type, amount, description,
      transaction_date, reference_type, reference_id, created_by, status
    ) VALUES (
      NEW.branch_id, _account_id, 'expense',
      -1 * COALESCE(NEW.net_salary, 0),
      'Salary Reversal — ' || COALESCE(_staff_name, 'Staff') || ' (' || _month_label || ')',
      CURRENT_DATE, 'payroll_reversed', NEW.id,
      COALESCE(NEW.reversed_by, NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix sync_claim_payment_to_transaction: proper UUID usage
CREATE OR REPLACE FUNCTION public.sync_claim_payment_to_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _account_id uuid;
  _staff_name text;
  _branch_id uuid;
BEGIN
  IF NEW.paid_at IS NOT NULL AND (OLD.paid_at IS NULL) THEN
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = NEW.id AND reference_type = 'claim'
    ) THEN
      RETURN NEW;
    END IF;

    _branch_id := NEW.branch_id;

    IF _branch_id IS NULL THEN
      SELECT bm.branch_id INTO _branch_id
      FROM branch_memberships bm
      WHERE bm.user_id = NEW.user_id
      LIMIT 1;
    END IF;

    IF _branch_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT first_name || ' ' || last_name INTO _staff_name
    FROM profiles WHERE id = NEW.user_id;

    _account_id := get_or_create_system_account(_branch_id, 'expense', 'SYS-CLM', 'Staff Claims');

    INSERT INTO transactions (
      branch_id, account_id, type, amount, description,
      transaction_date, reference_type, reference_id, created_by, status
    ) VALUES (
      _branch_id, _account_id, 'expense',
      COALESCE(NEW.amount, 0),
      'Claim — ' || COALESCE(initcap(NEW.claim_type), 'General') || ': ' || COALESCE(_staff_name, 'Staff'),
      CURRENT_DATE, 'claim', NEW.id,
      COALESCE(NEW.paid_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;
