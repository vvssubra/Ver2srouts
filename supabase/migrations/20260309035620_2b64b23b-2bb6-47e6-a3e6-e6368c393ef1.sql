
-- Create newsletters table
CREATE TABLE public.newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  content_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_audience TEXT NOT NULL DEFAULT 'parents',
  status TEXT NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  sent_by UUID,
  recipient_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

-- Branch members can view newsletters
CREATE POLICY "Branch members can view newsletters"
  ON public.newsletters FOR SELECT TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

-- Franchisees and super admins can manage newsletters
CREATE POLICY "Admins can insert newsletters"
  ON public.newsletters FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update newsletters"
  ON public.newsletters FOR UPDATE TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete newsletters"
  ON public.newsletters FOR DELETE TO authenticated
  USING (public.is_member_of_branch(auth.uid(), branch_id) OR public.is_super_admin(auth.uid()));

-- Create newsletter-assets storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('newsletter-assets', 'newsletter-assets', true);

-- Storage RLS for newsletter-assets
CREATE POLICY "Authenticated users can upload newsletter assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'newsletter-assets');

CREATE POLICY "Anyone can view newsletter assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'newsletter-assets');

CREATE POLICY "Authenticated users can delete newsletter assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'newsletter-assets');
