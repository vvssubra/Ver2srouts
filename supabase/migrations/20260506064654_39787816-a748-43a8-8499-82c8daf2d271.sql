
-- 1. Add hospitalisation to leave_type enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'leave_type' AND e.enumlabel = 'hospitalisation'
  ) THEN
    ALTER TYPE leave_type ADD VALUE 'hospitalisation';
  END IF;
END$$;

-- 2. Custom leave types defined per branch
CREATE TABLE IF NOT EXISTS public.custom_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  default_days integer NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

ALTER TABLE public.custom_leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers manage custom leave types"
  ON public.custom_leave_types FOR ALL
  TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Staff view active custom leave types in their branch"
  ON public.custom_leave_types FOR SELECT
  TO authenticated
  USING (is_active = true AND public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_custom_leave_types_updated_at
  BEFORE UPDATE ON public.custom_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Custom leave balances per user/year/type
CREATE TABLE IF NOT EXISTS public.custom_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  custom_leave_type_id uuid NOT NULL REFERENCES public.custom_leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL DEFAULT EXTRACT(year FROM CURRENT_DATE),
  total integer NOT NULL DEFAULT 0,
  used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, custom_leave_type_id, year)
);

ALTER TABLE public.custom_leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers manage custom leave balances"
  ON public.custom_leave_balances FOR ALL
  TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Staff view own custom leave balances"
  ON public.custom_leave_balances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER trg_custom_leave_balances_updated_at
  BEFORE UPDATE ON public.custom_leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Reference custom type from leave_requests
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS custom_leave_type_id uuid
  REFERENCES public.custom_leave_types(id) ON DELETE SET NULL;
