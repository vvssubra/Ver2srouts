-- Analytics events table for product telemetry (e.g., mobile app install funnel)
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text,
  branch_id uuid,
  path text,
  referrer text,
  user_agent text,
  platform text,
  display_mode text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_event_name ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX idx_analytics_events_user_id ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX idx_analytics_events_branch_id ON public.analytics_events (branch_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can write their own events
CREATE POLICY "Authenticated users can insert their own events"
ON public.analytics_events
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Anonymous (logged-out) inserts allowed too, e.g., /install page hit before signin
CREATE POLICY "Anonymous can insert events with no user"
ON public.analytics_events
FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- Only super_admin / franchisee / admin can read analytics
CREATE POLICY "Admins can read analytics events"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'franchisee')
  OR public.has_role(auth.uid(), 'admin')
);