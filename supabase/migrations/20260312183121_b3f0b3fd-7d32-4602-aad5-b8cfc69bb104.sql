
-- Add assigned_class_ids to branch_memberships for teacher class scoping
ALTER TABLE public.branch_memberships 
ADD COLUMN IF NOT EXISTS assigned_class_ids uuid[] DEFAULT '{}';

-- Helper function to get teacher's class IDs (returns all branch classes if empty/null for managers)
CREATE OR REPLACE FUNCTION public.get_teacher_class_ids(_user_id uuid, _branch_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN COALESCE(bm.assigned_class_ids, '{}') = '{}' THEN 
      ARRAY(SELECT id FROM public.classes WHERE branch_id = _branch_id AND is_active = true)
    ELSE 
      bm.assigned_class_ids
  END
  FROM public.branch_memberships bm
  WHERE bm.user_id = _user_id AND bm.branch_id = _branch_id
  LIMIT 1
$$;
