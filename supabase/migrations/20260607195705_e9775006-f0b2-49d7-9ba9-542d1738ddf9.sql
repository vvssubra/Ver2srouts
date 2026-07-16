
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS inquiry_date date;
UPDATE public.leads SET inquiry_date = created_at::date WHERE inquiry_date IS NULL;

CREATE TABLE IF NOT EXISTS public.source_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  period_month date NOT NULL,
  source text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, period_month, source)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_enquiries TO authenticated;
GRANT ALL ON public.source_enquiries TO service_role;

ALTER TABLE public.source_enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view source enquiries"
  ON public.source_enquiries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = source_enquiries.branch_id
  ));

CREATE POLICY "Branch members insert source enquiries"
  ON public.source_enquiries FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = source_enquiries.branch_id
  ));

CREATE POLICY "Branch members update source enquiries"
  ON public.source_enquiries FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = source_enquiries.branch_id
  ));

CREATE POLICY "Branch members delete source enquiries"
  ON public.source_enquiries FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = source_enquiries.branch_id
  ));

CREATE TRIGGER update_source_enquiries_updated_at
  BEFORE UPDATE ON public.source_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
