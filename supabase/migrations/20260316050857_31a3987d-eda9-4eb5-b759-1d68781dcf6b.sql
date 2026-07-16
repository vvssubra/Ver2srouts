
-- Create branch_events table
CREATE TABLE public.branch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
  event_date DATE NOT NULL,
  event_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'holiday',
  is_paid BOOLEAN NOT NULL DEFAULT true,
  affects_attendance BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.branch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view branch events" ON public.branch_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can insert branch events" ON public.branch_events
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'franchisee', 'admin'))
  );

CREATE POLICY "Managers can update branch events" ON public.branch_events
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'franchisee', 'admin'))
  );

CREATE POLICY "Managers can delete branch events" ON public.branch_events
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'franchisee', 'admin'))
  );

-- Add columns to school_holidays
ALTER TABLE public.school_holidays ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT true;
ALTER TABLE public.school_holidays ADD COLUMN IF NOT EXISTS affects_attendance BOOLEAN DEFAULT true;
