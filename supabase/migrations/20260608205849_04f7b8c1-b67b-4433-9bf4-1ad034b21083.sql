CREATE OR REPLACE FUNCTION public.is_branch_manager(_user_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    has_role(_user_id, 'super_admin'::app_role)
    OR (
      (has_role(_user_id, 'franchisee'::app_role) OR has_role(_user_id, 'admin'::app_role))
      AND is_member_of_branch(_user_id, _branch_id)
    )
$function$;