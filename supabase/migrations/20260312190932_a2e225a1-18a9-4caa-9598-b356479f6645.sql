
-- 1. Drop old check constraint and recreate with trial_scheduled
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check CHECK (status IN ('new', 'contacted', 'tour_scheduled', 'trial_scheduled', 'waitlisted', 'enrolled'));

-- 2. Add source column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text DEFAULT 'walk_in';

-- 3. Create lead_activities table for timeline/history
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON public.lead_activities(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- RLS: super_admin can see all
CREATE POLICY "Super admins can manage lead_activities"
  ON public.lead_activities FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- RLS: branch members can see activities for leads in their branch
CREATE POLICY "Branch members can view lead_activities"
  ON public.lead_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.branch_memberships bm ON bm.branch_id = l.branch_id
      WHERE l.id = lead_activities.lead_id AND bm.user_id = auth.uid()
    )
  );

-- RLS: branch members can insert activities for leads in their branch
CREATE POLICY "Branch members can insert lead_activities"
  ON public.lead_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      JOIN public.branch_memberships bm ON bm.branch_id = l.branch_id
      WHERE l.id = lead_activities.lead_id AND bm.user_id = auth.uid()
    )
  );
