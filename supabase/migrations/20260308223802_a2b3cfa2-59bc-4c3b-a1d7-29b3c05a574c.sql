-- Create worksheets storage bucket only
INSERT INTO storage.buckets (id, name, public)
VALUES ('worksheets', 'worksheets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for worksheets bucket
CREATE POLICY "Authenticated users upload worksheets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'worksheets');

CREATE POLICY "Anyone can view worksheets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'worksheets');

CREATE POLICY "Admins delete worksheets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'worksheets' AND (
  public.is_super_admin(auth.uid()) OR
  public.has_role(auth.uid(), 'franchisee')
));