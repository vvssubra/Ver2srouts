
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'leave_type' AND e.enumlabel = 'custom'
  ) THEN
    ALTER TYPE leave_type ADD VALUE 'custom';
  END IF;
END$$;
