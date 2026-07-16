
-- Trigger function: when paid_at goes from non-null to null, insert a negative expense transaction
CREATE OR REPLACE FUNCTION public.sync_claim_reversal_to_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _account_id uuid;
  _staff_name text;
  _branch_id uuid;
BEGIN
  -- Only fire when paid_at was set and is now cleared
  IF OLD.paid_at IS NOT NULL AND NEW.paid_at IS NULL THEN
    _branch_id := COALESCE(NEW.branch_id, OLD.branch_id);

    IF _branch_id IS NULL THEN
      SELECT bm.branch_id INTO _branch_id
      FROM branch_memberships bm
      WHERE bm.user_id = NEW.user_id
      LIMIT 1;
    END IF;

    IF _branch_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Idempotency: skip if reversal transaction already exists
    IF EXISTS (
      SELECT 1 FROM transactions
      WHERE reference_id = NEW.id::text AND reference_type = 'claim_reversal'
    ) THEN
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
      -1 * COALESCE(OLD.amount, 0),
      'Claim Reversal — ' || COALESCE(initcap(NEW.claim_type), 'General') || ': ' || COALESCE(_staff_name, 'Staff'),
      CURRENT_DATE, 'claim_reversal', NEW.id::text,
      COALESCE(NEW.paid_by, '00000000-0000-0000-0000-000000000000'::uuid),
      'approved'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
CREATE TRIGGER trg_sync_claim_reversal_to_transaction
AFTER UPDATE ON public.staff_claims
FOR EACH ROW
WHEN (OLD.paid_at IS NOT NULL AND NEW.paid_at IS NULL)
EXECUTE FUNCTION public.sync_claim_reversal_to_transaction();
