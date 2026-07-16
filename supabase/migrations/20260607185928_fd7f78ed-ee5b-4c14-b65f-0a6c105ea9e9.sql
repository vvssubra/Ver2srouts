CREATE TABLE IF NOT EXISTS public.marketing_spend (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  spend_month DATE NOT NULL,
  source TEXT,
  campaign_name TEXT,
  channel TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_spend TO authenticated;
GRANT ALL ON public.marketing_spend TO service_role;

ALTER TABLE public.marketing_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members can view marketing spend"
ON public.marketing_spend FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = marketing_spend.branch_id
  )
);

CREATE POLICY "Branch members can insert marketing spend"
ON public.marketing_spend FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = marketing_spend.branch_id
  )
);

CREATE POLICY "Branch members can update marketing spend"
ON public.marketing_spend FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = marketing_spend.branch_id
  )
);

CREATE POLICY "Branch members can delete marketing spend"
ON public.marketing_spend FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.branch_memberships m
    WHERE m.user_id = auth.uid() AND m.branch_id = marketing_spend.branch_id
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_spend_branch_month
  ON public.marketing_spend(branch_id, spend_month);

CREATE TRIGGER trg_marketing_spend_updated_at
BEFORE UPDATE ON public.marketing_spend
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();