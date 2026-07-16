
DROP POLICY "Members can view branch memberships" ON public.branch_memberships;

CREATE POLICY "Members can view branch memberships"
ON public.branch_memberships FOR SELECT TO authenticated
USING (
  is_member_of_branch(auth.uid(), branch_id)
  OR has_role(auth.uid(), 'franchisee'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
);
