CREATE OR REPLACE FUNCTION public.match_worksheets(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 3
)
RETURNS TABLE (id uuid, title text, subject text, pdf_url text, metadata_tags text[], similarity float)
LANGUAGE sql STABLE
AS $$
  SELECT w.id, w.title, w.subject, w.pdf_url, w.metadata_tags,
         1 - (w.embedding <=> query_embedding) AS similarity
  FROM public.worksheets w
  WHERE w.embedding IS NOT NULL
    AND 1 - (w.embedding <=> query_embedding) > match_threshold
  ORDER BY w.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.search_worksheets_by_tags(
  search_tags text[],
  match_count int DEFAULT 3
)
RETURNS TABLE (id uuid, title text, subject text, pdf_url text, metadata_tags text[], relevance bigint)
LANGUAGE sql STABLE
AS $$
  SELECT w.id, w.title, w.subject, w.pdf_url, w.metadata_tags,
         (SELECT count(*) FROM unnest(w.metadata_tags) tag WHERE tag = ANY(search_tags)) AS relevance
  FROM public.worksheets w
  WHERE w.metadata_tags && search_tags
  ORDER BY relevance DESC
  LIMIT match_count;
$$;

ALTER TABLE public.lesson_plans ADD COLUMN methodology text DEFAULT 'Default KP2026';