CREATE POLICY "Email assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');