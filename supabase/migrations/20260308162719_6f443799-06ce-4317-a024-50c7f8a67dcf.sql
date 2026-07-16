CREATE TABLE public.worksheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  pdf_url text NOT NULL,
  metadata_tags text[] DEFAULT '{}',
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read worksheets"
  ON public.worksheets FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage worksheets"
  ON public.worksheets FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE TABLE public.methodology_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  core_principles text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.methodology_frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read frameworks"
  ON public.methodology_frameworks FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage frameworks"
  ON public.methodology_frameworks FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));