
-- Create email_logs table for tracking all sent emails
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  metadata JSONB,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can view all email logs
CREATE POLICY "Super admins view all email logs"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Branch members can view email logs for their branch
CREATE POLICY "Branch members view their email logs"
  ON public.email_logs FOR SELECT
  TO authenticated
  USING (
    branch_id IS NOT NULL AND
    public.is_member_of_branch(auth.uid(), branch_id)
  );

-- Service role can insert (edge functions use service role)
CREATE POLICY "Service role insert email logs"
  ON public.email_logs FOR INSERT
  WITH CHECK (true);
