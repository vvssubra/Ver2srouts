
-- 1. Drop the old invoice-level sync trigger and function (income now tracked per-payment)
DROP TRIGGER IF EXISTS trg_sync_invoice_to_transaction ON public.invoices;
DROP FUNCTION IF EXISTS public.sync_invoice_to_transaction();

-- 2. Create sync_payment_to_transaction() — tracks every payment as income
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
  -- Get invoice details
  SELECT i.invoice_number, i.branch_id,
         s.first_name || ' ' || s.last_name
  INTO _invoice_number, _branch_id, _student_name
  FROM invoices i
  LEFT JOIN students s ON s.id = i.student_id
  WHERE i.id = NEW.invoice_id;

  -- If no invoice linked (unallocated payment), use branch from payment if available
  IF _branch_id IS NULL THEN
    _branch_id := NEW.branch_id;
  END IF;

  IF _branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency: skip if already recorded
  IF EXISTS (
    SELECT 1 FROM transactions
    WHERE reference_id = NEW.id::text AND reference_type = 'payment'
  ) THEN
    RETURN NEW;
  END IF;

  _account_id := get_or_create_system_account(_branch_id, 'revenue', 'SYS-REV', 'Tuition Revenue');

  INSERT INTO transactions (
    branch_id, account_id, type, amount, description,
    transaction_date, reference_type, reference_id, created_by, status
  ) VALUES (
    _branch_id,
    _account_id,
    'income',
    NEW.amount,
    'Payment received — ' || COALESCE(_invoice_number, 'Unallocated') || ' — ' || COALESCE(_student_name, 'Student'),
    CURRENT_DATE,
    'payment',
    NEW.id::text,
    COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    'approved'
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_payment_to_transaction
AFTER INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_to_transaction();

-- 3. Create sync_payroll_to_transaction() — tracks payroll as expense
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
  _ref_key text;
BEGIN
  -- Payroll marked as paid
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    _ref_key := NEW.id::text || '_paid';

    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = _ref_key AND reference_type = 'payroll'
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
      NEW.branch_id,
      _account_id,
      'expense',
      COALESCE(NEW.net_salary, 0),
      'Salary — ' || COALESCE(_staff_name, 'Staff') || ' (' || _month_label || ')',
      CURRENT_DATE,
      'payroll',
      _ref_key,
      COALESCE(NEW.confirmed_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  -- Payroll reversed: compensating negative entry
  IF NEW.status = 'reversed' AND (OLD.status IS NULL OR OLD.status != 'reversed') THEN
    _ref_key := NEW.id::text || '_reversed';

    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = _ref_key AND reference_type = 'payroll'
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
      NEW.branch_id,
      _account_id,
      'expense',
      -1 * COALESCE(NEW.net_salary, 0),
      'Salary Reversal — ' || COALESCE(_staff_name, 'Staff') || ' (' || _month_label || ')',
      CURRENT_DATE,
      'payroll',
      _ref_key,
      COALESCE(NEW.confirmed_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_payroll_to_transaction
AFTER UPDATE ON public.payroll_records
FOR EACH ROW
EXECUTE FUNCTION public.sync_payroll_to_transaction();

-- 4. Create sync_claim_payment_to_transaction() — tracks claim payments as expense
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
  -- Only fire when paid_at is newly set
  IF NEW.paid_at IS NOT NULL AND (OLD.paid_at IS NULL) THEN
    -- Idempotency
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = NEW.id::text AND reference_type = 'claim'
    ) THEN
      RETURN NEW;
    END IF;

    -- Get branch from staff's branch membership
    SELECT bm.branch_id INTO _branch_id
    FROM branch_memberships bm
    WHERE bm.user_id = NEW.user_id
    LIMIT 1;

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
      _branch_id,
      _account_id,
      'expense',
      COALESCE(NEW.amount, 0),
      'Claim — ' || COALESCE(initcap(NEW.category), 'General') || ': ' || COALESCE(_staff_name, 'Staff'),
      CURRENT_DATE,
      'claim',
      NEW.id::text,
      COALESCE(NEW.approved_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_sync_claim_payment_to_transaction
AFTER UPDATE ON public.staff_claims
FOR EACH ROW
EXECUTE FUNCTION public.sync_claim_payment_to_transaction();
