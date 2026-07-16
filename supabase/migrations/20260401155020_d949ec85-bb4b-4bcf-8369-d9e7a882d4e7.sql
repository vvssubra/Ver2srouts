
-- Expand worksheets table into a multi-type resource table
-- Adds resource_type, branch_id, age_groups, domains, learning_areas, language, content_text, author, source_url, is_ai_reference

ALTER TABLE public.worksheets
  ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'worksheet',
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS age_groups text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS domains text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS learning_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS is_ai_reference boolean NOT NULL DEFAULT true;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_worksheets_branch_type ON public.worksheets (branch_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_worksheets_type_age ON public.worksheets USING gin (age_groups);

-- New search function for AI context injection
CREATE OR REPLACE FUNCTION public.search_resources_for_ai(
  p_branch_id uuid,
  p_resource_types text[],
  p_age_groups text[] DEFAULT '{}',
  p_search_tags text[] DEFAULT '{}',
  p_match_count integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  resource_type text,
  subject text,
  content_text text,
  author text,
  source_url text,
  pdf_url text,
  metadata_tags text[],
  age_groups text[],
  relevance bigint
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    w.id, w.title, w.resource_type, w.subject,
    w.content_text, w.author, w.source_url, w.pdf_url,
    w.metadata_tags, w.age_groups,
    COALESCE(
      (SELECT count(*) FROM unnest(w.metadata_tags) tag WHERE tag = ANY(p_search_tags)),
      0
    ) AS relevance
  FROM public.worksheets w
  WHERE w.is_ai_reference = true
    AND w.resource_type = ANY(p_resource_types)
    AND (p_branch_id IS NULL OR w.branch_id IS NULL OR w.branch_id = p_branch_id)
    AND (
      array_length(p_age_groups, 1) IS NULL
      OR p_age_groups = '{}'
      OR w.age_groups && p_age_groups
    )
    AND (
      array_length(p_search_tags, 1) IS NULL
      OR p_search_tags = '{}'
      OR w.metadata_tags && p_search_tags
      OR w.title ILIKE '%' || array_to_string(p_search_tags, '%') || '%'
    )
  ORDER BY relevance DESC, w.created_at DESC
  LIMIT p_match_count;
$$;
