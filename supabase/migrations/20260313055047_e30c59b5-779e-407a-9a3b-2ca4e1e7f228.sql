
ALTER TABLE public.access_groups ADD COLUMN managed_routes text[] DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.get_user_managed_routes(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT unnested)
     FROM access_group_members agm
     JOIN access_groups ag ON ag.id = agm.group_id
     CROSS JOIN LATERAL unnest(ag.managed_routes) AS unnested
     WHERE agm.user_id = _user_id AND ag.is_active = true),
    '{}'::TEXT[]
  );
$$;
