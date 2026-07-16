
-- 1. Extend overtime_requests
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS ot_month date,
  ADD COLUMN IF NOT EXISTS payroll_month date,
  ADD COLUMN IF NOT EXISTS is_late_submission boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_request_id uuid REFERENCES public.overtime_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_approved_by uuid,
  ADD COLUMN IF NOT EXISTS amendment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS amendment_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS amendment_approved_by uuid,
  ADD COLUMN IF NOT EXISTS payroll_adjustment_id uuid,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_in_payroll_id uuid,
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

UPDATE public.overtime_requests
SET ot_month = COALESCE(ot_month, date_trunc('month', date)::date),
    payroll_month = COALESCE(payroll_month, date_trunc('month', date)::date),
    submitted_at = COALESCE(submitted_at, created_at)
WHERE ot_month IS NULL OR payroll_month IS NULL OR submitted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_overtime_requests_payroll_month ON public.overtime_requests(payroll_month);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_ot_month ON public.overtime_requests(ot_month);
CREATE INDEX IF NOT EXISTS idx_overtime_requests_user_status ON public.overtime_requests(user_id, status);

-- 2. compute_payroll_month helper
CREATE OR REPLACE FUNCTION public.compute_payroll_month(_ot_date date, _submitted_at timestamptz)
RETURNS TABLE (payroll_month date, is_late boolean, is_allowed boolean)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  submitted_month date := date_trunc('month', _submitted_at AT TIME ZONE 'UTC')::date;
  ot_month_v date := date_trunc('month', _ot_date)::date;
  prev_month date := (submitted_month - INTERVAL '1 month')::date;
BEGIN
  IF ot_month_v = submitted_month THEN
    RETURN QUERY SELECT submitted_month, false, true;
  ELSIF ot_month_v = prev_month THEN
    RETURN QUERY SELECT submitted_month, true, true;
  ELSIF ot_month_v > submitted_month THEN
    RETURN QUERY SELECT submitted_month, false, true;
  ELSE
    RETURN QUERY SELECT NULL::date, false, false;
  END IF;
END; $$;

-- 3. Prevent hard-delete of approved OT
CREATE OR REPLACE FUNCTION public.prevent_delete_approved_ot()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('approved','late_pending_approval','pending_payroll','assigned_next_payroll','paid','cancellation_requested','amendment_requested','cancelled') THEN
    RAISE EXCEPTION 'Approved OT records cannot be permanently deleted (id=%). Use cancellation workflow instead.', OLD.id;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_approved_ot ON public.overtime_requests;
CREATE TRIGGER trg_prevent_delete_approved_ot
BEFORE DELETE ON public.overtime_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_approved_ot();

-- 4. payroll_adjustments
CREATE TABLE IF NOT EXISTS public.payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('late_ot','ot_cancellation','ot_amendment','manual_correction','additional_payment','deduction')),
  source_ref_id uuid,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  hours numeric(8,2),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','included','paid','rejected')),
  target_payroll_month date NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  included_in_payroll_id uuid,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payroll_adjustments TO authenticated;
GRANT ALL ON public.payroll_adjustments TO service_role;
ALTER TABLE public.payroll_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own adjustments, admins view all" ON public.payroll_adjustments
FOR SELECT TO authenticated
USING (staff_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins insert payroll adjustments" ON public.payroll_adjustments
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins update payroll adjustments" ON public.payroll_adjustments
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_target ON public.payroll_adjustments(target_payroll_month, status);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_staff ON public.payroll_adjustments(staff_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_payroll_adjustments_touch ON public.payroll_adjustments;
CREATE TRIGGER trg_payroll_adjustments_touch
BEFORE UPDATE ON public.payroll_adjustments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$ BEGIN
  ALTER TABLE public.overtime_requests
    ADD CONSTRAINT overtime_requests_payroll_adjustment_fk
    FOREIGN KEY (payroll_adjustment_id) REFERENCES public.payroll_adjustments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. ot_audit_log
CREATE TABLE IF NOT EXISTS public.ot_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_request_id uuid NOT NULL REFERENCES public.overtime_requests(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ot_audit_log TO authenticated;
GRANT ALL ON public.ot_audit_log TO service_role;
ALTER TABLE public.ot_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own OT audit, admins view all" ON public.ot_audit_log
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.overtime_requests o WHERE o.id = ot_request_id AND o.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
);

CREATE POLICY "Authenticated insert OT audit" ON public.ot_audit_log
FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE INDEX IF NOT EXISTS idx_ot_audit_log_request ON public.ot_audit_log(ot_request_id, created_at DESC);

-- 6. reminder_settings
CREATE TABLE IF NOT EXISTS public.reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL UNIQUE DEFAULT 'ot_leave',
  frequency_weeks integer NOT NULL DEFAULT 2 CHECK (frequency_weeks BETWEEN 1 AND 12),
  day_of_week integer NOT NULL DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
  time_of_day time NOT NULL DEFAULT '10:00:00',
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reminder_settings TO authenticated;
GRANT ALL ON public.reminder_settings TO service_role;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view reminder settings" ON public.reminder_settings
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage reminder settings" ON public.reminder_settings
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP TRIGGER IF EXISTS trg_reminder_settings_touch ON public.reminder_settings;
CREATE TRIGGER trg_reminder_settings_touch
BEFORE UPDATE ON public.reminder_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.reminder_settings (kind) VALUES ('ot_leave') ON CONFLICT (kind) DO NOTHING;
