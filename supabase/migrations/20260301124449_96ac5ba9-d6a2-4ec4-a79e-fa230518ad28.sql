
-- =============================================
-- WORKSTREAM 2: Multi-Level Leave Approval
-- =============================================
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approval_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_approval_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS level1_approved_by uuid,
  ADD COLUMN IF NOT EXISTS level1_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS level1_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS level1_notes text,
  ADD COLUMN IF NOT EXISTS level2_approved_by uuid,
  ADD COLUMN IF NOT EXISTS level2_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS level2_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS level2_notes text;

-- =============================================
-- WORKSTREAM 4: Staff Performance Management
-- =============================================
CREATE TABLE public.performance_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  reviewer_id uuid NOT NULL,
  review_period_start date NOT NULL,
  review_period_end date NOT NULL,
  overall_rating integer CHECK (overall_rating >= 1 AND overall_rating <= 5),
  strengths text,
  improvements text,
  goals text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view own reviews" ON public.performance_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Franchisees manage branch reviews" ON public.performance_reviews
  FOR ALL USING (
    has_role(auth.uid(), 'franchisee'::app_role) 
    AND is_member_of_branch(auth.uid(), branch_id)
  );

CREATE POLICY "Super admins manage all reviews" ON public.performance_reviews
  FOR ALL USING (is_super_admin(auth.uid()));

CREATE TRIGGER update_performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- KPIs table
CREATE TABLE public.performance_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  kpi_name text NOT NULL,
  target text,
  actual text,
  score integer CHECK (score >= 1 AND score <= 5),
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "KPIs follow review access" ON public.performance_kpis
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.performance_reviews r
      WHERE r.id = performance_kpis.review_id
      AND (r.user_id = auth.uid() OR is_super_admin(auth.uid())
        OR (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), r.branch_id)))
    )
  );

CREATE POLICY "Managers manage KPIs" ON public.performance_kpis
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.performance_reviews r
      WHERE r.id = performance_kpis.review_id
      AND (is_super_admin(auth.uid())
        OR (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), r.branch_id)))
    )
  );

-- =============================================
-- WORKSTREAM 5: In-App Notifications
-- =============================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'general',
  is_read boolean NOT NULL DEFAULT false,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage notifications" ON public.notifications
  FOR ALL USING (is_super_admin(auth.uid()));
