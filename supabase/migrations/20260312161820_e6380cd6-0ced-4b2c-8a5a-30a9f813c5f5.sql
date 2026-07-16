
-- Add category column to learning_areas
ALTER TABLE public.learning_areas ADD COLUMN category text NOT NULL DEFAULT 'KP2026';

-- Add plan_mode column to lesson_plans
ALTER TABLE public.lesson_plans ADD COLUMN plan_mode text NOT NULL DEFAULT 'ai_theme';

-- Create curriculum-documents storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('curriculum-documents', 'curriculum-documents', false);

-- RLS for curriculum-documents bucket
CREATE POLICY "Authenticated users can upload curriculum docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'curriculum-documents');

CREATE POLICY "Authenticated users can read curriculum docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'curriculum-documents');
