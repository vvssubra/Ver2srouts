-- Additive, reversible admissions-tracking columns on public.leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tour_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tour_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrolled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enrollment_student_id UUID,
  ADD COLUMN IF NOT EXISTS total_fees_paid_at_enrollment NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS enrollment_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_payment_date DATE,
  ADD COLUMN IF NOT EXISTS assessment_skipped_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS marketing_attribution_month DATE;

-- Trigger: default the marketing attribution month to the month the lead was created
CREATE OR REPLACE FUNCTION public.leads_set_attribution_month()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.marketing_attribution_month IS NULL THEN
    NEW.marketing_attribution_month := date_trunc('month', COALESCE(NEW.created_at, now()))::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_set_attribution_month ON public.leads;
CREATE TRIGGER trg_leads_set_attribution_month
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.leads_set_attribution_month();

-- Helpful indexes for upcoming ROI / funnel reporting
CREATE INDEX IF NOT EXISTS idx_leads_attribution_month ON public.leads (branch_id, marketing_attribution_month);
CREATE INDEX IF NOT EXISTS idx_leads_enrolled_at        ON public.leads (branch_id, enrolled_at);
CREATE INDEX IF NOT EXISTS idx_leads_source             ON public.leads (branch_id, source);