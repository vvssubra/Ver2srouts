
-- Access Groups table
CREATE TABLE public.access_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  allowed_routes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access Group Members table
CREATE TABLE public.access_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.access_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Enable RLS
ALTER TABLE public.access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_group_members ENABLE ROW LEVEL SECURITY;

-- RLS for access_groups
CREATE POLICY "Branch members view access groups"
ON public.access_groups FOR SELECT
TO authenticated
USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees manage access groups"
ON public.access_groups FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id))
WITH CHECK (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage access groups"
ON public.access_groups FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- RLS for access_group_members
CREATE POLICY "Branch members view group members"
ON public.access_group_members FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM access_groups ag
  WHERE ag.id = group_id AND is_member_of_branch(auth.uid(), ag.branch_id)
));

CREATE POLICY "Franchisees manage group members"
ON public.access_group_members FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM access_groups ag
  WHERE ag.id = group_id AND has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), ag.branch_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM access_groups ag
  WHERE ag.id = group_id AND has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), ag.branch_id)
));

CREATE POLICY "Super admins manage group members"
ON public.access_group_members FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Security definer function to get user's allowed routes
CREATE OR REPLACE FUNCTION public.get_user_allowed_routes(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT array_agg(DISTINCT unnested)
     FROM access_group_members agm
     JOIN access_groups ag ON ag.id = agm.group_id
     CROSS JOIN LATERAL unnest(ag.allowed_routes) AS unnested
     WHERE agm.user_id = _user_id AND ag.is_active = true),
    '{}'::TEXT[]
  );
$$;
