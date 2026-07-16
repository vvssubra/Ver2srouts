
-- Create leads table
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  parent_name text NOT NULL,
  child_name text NOT NULL,
  child_age integer,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'tour_scheduled', 'waitlisted', 'enrolled')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view leads" ON public.leads FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage leads" ON public.leads FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage leads" ON public.leads FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Create tours table
CREATE TABLE public.tours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'no_show')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch members view tours" ON public.tours FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage tours" ON public.tours FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage tours" ON public.tours FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Add columns to student_observations
ALTER TABLE public.student_observations
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS ai_learning_story text,
  ADD COLUMN IF NOT EXISTS is_shared_with_parent boolean NOT NULL DEFAULT false;
