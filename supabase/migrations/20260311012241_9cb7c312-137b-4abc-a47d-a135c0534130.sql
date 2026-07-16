
-- Create eforms table
CREATE TABLE public.eforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  form_type text NOT NULL DEFAULT 'registration',
  description text,
  default_fields jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  share_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create unique index on share_token
CREATE UNIQUE INDEX eforms_share_token_key ON public.eforms(share_token);

-- Create eform_submissions table
CREATE TABLE public.eform_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eform_id uuid NOT NULL REFERENCES public.eforms(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  recipient_name text NOT NULL DEFAULT '',
  recipient_email text NOT NULL DEFAULT '',
  recipient_phone text,
  status text NOT NULL DEFAULT 'sent',
  submitted_data jsonb DEFAULT '{}'::jsonb,
  sent_at timestamptz DEFAULT now(),
  submitted_at timestamptz,
  child_name text,
  child_level text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add eform_submission_id to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS eform_submission_id uuid REFERENCES public.eform_submissions(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.eforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eform_submissions ENABLE ROW LEVEL SECURITY;

-- RLS for eforms: super_admin full access, branch managers manage their branch
CREATE POLICY "Super admins manage all eforms" ON public.eforms
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers manage eforms" ON public.eforms
  FOR ALL TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Branch members read eforms" ON public.eforms
  FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

-- Public read for share_token lookup (for public form)
CREATE POLICY "Public can read active eforms by token" ON public.eforms
  FOR SELECT TO anon
  USING (is_active = true);

-- RLS for eform_submissions
CREATE POLICY "Super admins manage all submissions" ON public.eform_submissions
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Branch managers manage submissions" ON public.eform_submissions
  FOR ALL TO authenticated
  USING (public.is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "Branch members read submissions" ON public.eform_submissions
  FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id));

-- Allow anonymous inserts for public form submissions
CREATE POLICY "Public can insert submissions" ON public.eform_submissions
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anonymous updates for public form submissions (to update status/data)
CREATE POLICY "Public can update own submissions" ON public.eform_submissions
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger for eforms
CREATE TRIGGER eforms_updated_at BEFORE UPDATE ON public.eforms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for submissions tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.eform_submissions;
