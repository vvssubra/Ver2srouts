-- Helper: get or create a system account for auto-sync
CREATE OR REPLACE FUNCTION public.get_or_create_system_account(
  _branch_id uuid, _type text, _code text, _name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _account_id uuid;
BEGIN
  SELECT id INTO _account_id FROM accounts
  WHERE branch_id = _branch_id AND code = _code AND is_system = true LIMIT 1;

  IF _account_id IS NULL THEN
    INSERT INTO accounts (branch_id, type, code, name, is_system, is_active)
    VALUES (_branch_id, _type, _code, _name, true, true)
    RETURNING id INTO _account_id;
  END IF;

  RETURN _account_id;
END;
$$;

-- Trigger function: auto-create transaction when invoice status changes to paid
CREATE OR REPLACE FUNCTION public.sync_invoice_to_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _account_id uuid;
  _student_name text;
BEGIN
  -- Invoice paid: create income transaction
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    _account_id := get_or_create_system_account(NEW.branch_id, 'revenue', 'SYS-REV', 'Tuition Revenue');

    SELECT first_name || ' ' || last_name INTO _student_name
    FROM students WHERE id = NEW.student_id;

    IF NOT EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id::text AND reference_type = 'invoice') THEN
      INSERT INTO transactions (branch_id, account_id, type, amount, description, transaction_date, reference_type, reference_id, created_by, status)
      VALUES (NEW.branch_id, _account_id, 'income', NEW.total_amount,
              'Invoice ' || NEW.invoice_number || ' — ' || COALESCE(_student_name, 'Student'),
              CURRENT_DATE, 'invoice', NEW.id::text, NEW.created_by, 'approved');
    END IF;
  END IF;

  -- Invoice cancelled after being paid: remove the auto-created transaction
  IF NEW.status = 'cancelled' AND OLD.status = 'paid' THEN
    DELETE FROM transactions WHERE reference_id = OLD.id::text AND reference_type = 'invoice';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger function: auto-create transaction when expense is added
CREATE OR REPLACE FUNCTION public.sync_expense_to_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _account_id uuid;
BEGIN
  _account_id := get_or_create_system_account(NEW.branch_id, 'expense', 'SYS-EXP', 'Operating Expenses');

  INSERT INTO transactions (branch_id, account_id, type, amount, description, transaction_date, reference_type, reference_id, created_by, status)
  VALUES (NEW.branch_id, _account_id, 'expense', NEW.amount,
          initcap(NEW.category) || ': ' || COALESCE(NEW.description, 'Operational expense'),
          NEW.date, 'expense', NEW.id::text, NEW.created_by, 'approved');

  RETURN NEW;
END;
$$;

-- Trigger function: auto-create transaction when credit note is approved
CREATE OR REPLACE FUNCTION public.sync_credit_note_to_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _account_id uuid;
  _student_name text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    _account_id := get_or_create_system_account(NEW.branch_id, 'expense', 'SYS-REF', 'Refunds & Credits');

    SELECT first_name || ' ' || last_name INTO _student_name
    FROM students WHERE id = NEW.student_id;

    IF NOT EXISTS (SELECT 1 FROM transactions WHERE reference_id = NEW.id::text AND reference_type = 'refund') THEN
      INSERT INTO transactions (branch_id, account_id, type, amount, description, transaction_date, reference_type, reference_id, created_by, status)
      VALUES (NEW.branch_id, _account_id, 'expense', NEW.amount,
              'Credit Note ' || NEW.credit_note_number || ' — ' || COALESCE(_student_name, 'Student'),
              CURRENT_DATE, 'refund', NEW.id::text, NEW.created_by, 'approved');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the triggers
CREATE TRIGGER trg_sync_invoice_to_transaction
  AFTER UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_to_transaction();

CREATE TRIGGER trg_sync_expense_to_transaction
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.sync_expense_to_transaction();

CREATE TRIGGER trg_sync_credit_note_to_transaction
  AFTER UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.sync_credit_note_to_transaction();