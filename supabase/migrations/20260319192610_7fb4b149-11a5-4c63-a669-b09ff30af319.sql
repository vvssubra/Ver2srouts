
-- Branch billing configuration table
CREATE TABLE public.billing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  -- Invoice settings
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  invoice_numbering TEXT NOT NULL DEFAULT 'YYYYMM-SEQ',
  due_date_days INTEGER NOT NULL DEFAULT 15,
  grace_period_days INTEGER NOT NULL DEFAULT 7,
  -- Late fee
  late_fee_enabled BOOLEAN NOT NULL DEFAULT false,
  late_fee_type TEXT NOT NULL DEFAULT 'fixed',
  late_fee_amount NUMERIC NOT NULL DEFAULT 0,
  late_fee_max NUMERIC DEFAULT NULL,
  -- Reminders
  reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  reminder_days_before_due INTEGER[] NOT NULL DEFAULT '{7,3,1}',
  reminder_days_after_due INTEGER[] NOT NULL DEFAULT '{1,7,14,30}',
  reminder_channel TEXT NOT NULL DEFAULT 'whatsapp',
  -- Payment methods
  payment_methods_enabled TEXT[] NOT NULL DEFAULT '{cash,bank_transfer,cheque,billplz}',
  billplz_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Tax
  tax_enabled BOOLEAN NOT NULL DEFAULT false,
  tax_label TEXT NOT NULL DEFAULT 'SST',
  tax_rate NUMERIC NOT NULL DEFAULT 0,
  tax_registration_no TEXT DEFAULT NULL,
  -- Templates
  receipt_template JSONB DEFAULT NULL,
  invoice_template JSONB DEFAULT NULL,
  reminder_template JSONB DEFAULT NULL,
  credit_note_template JSONB DEFAULT NULL,
  statement_template JSONB DEFAULT NULL,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id)
);

ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch managers can manage billing config"
ON public.billing_config FOR ALL TO authenticated
USING (public.is_branch_manager(auth.uid(), branch_id))
WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Super admins full access to billing config"
ON public.billing_config FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
