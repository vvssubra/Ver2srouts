
-- Batch 6F-B-3: Teacher class scoping defense-in-depth via RLS
-- Adds restrictive policies that block plain teachers from accessing
-- student data outside their assigned classes. Admins, franchisees,
-- super admins, branch managers, and parents are unaffected.

-- Helper: is this user a plain teacher in _branch_id, with class
-- assignments that do NOT include _class_id?
CREATE OR REPLACE FUNCTION public.is_teacher_blocked_from_class(
  _user_id uuid, _branch_id uuid, _class_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'teacher'::app_role)
    AND NOT public.has_role(_user_id, 'super_admin'::app_role)
    AND NOT public.is_branch_manager(_user_id, _branch_id)
    AND EXISTS (
      SELECT 1
      FROM public.branch_memberships bm
      WHERE bm.user_id = _user_id
        AND bm.branch_id = _branch_id
        AND COALESCE(array_length(bm.assigned_class_ids, 1), 0) > 0
        AND (_class_id IS NULL OR NOT (_class_id = ANY(bm.assigned_class_ids)))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_blocked_from_student(
  _user_id uuid, _student_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.id = _student_id
      AND public.is_teacher_blocked_from_class(_user_id, s.branch_id, s.class_id)
  );
$$;

-- Update existing helper used by child_update_{media,skills,students} SELECT
-- to also enforce teacher class scoping on the staff branch path.
CREATE OR REPLACE FUNCTION public.can_user_view_child_update(_update_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.child_updates cu
    WHERE cu.id = _update_id
      AND (
        public.is_super_admin(_user_id)
        OR (
          public.is_member_of_branch(_user_id, cu.branch_id)
          AND (
            cu.student_id IS NULL
            OR NOT public.is_teacher_blocked_from_student(_user_id, cu.student_id)
          )
        )
        OR (
          cu.visible_to_parent = true
          AND (
            (cu.student_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.parent_students ps
              WHERE ps.student_id = cu.student_id
                AND ps.parent_id = _user_id
                AND ps.status = 'approved'
            ))
            OR EXISTS (
              SELECT 1
              FROM public.child_update_students cus
              JOIN public.parent_students ps ON ps.student_id = cus.student_id
              WHERE cus.update_id = cu.id
                AND ps.parent_id = _user_id
                AND ps.status = 'approved'
            )
          )
        )
      )
  );
$$;

-- Restrictive SELECT policies that hide out-of-class student data
-- from plain teachers. Non-teachers and branch managers are unaffected
-- because the helper returns false for them.

DROP POLICY IF EXISTS "Teacher class scope on students" ON public.students;
CREATE POLICY "Teacher class scope on students"
ON public.students AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.is_teacher_blocked_from_class(auth.uid(), branch_id, class_id));

DROP POLICY IF EXISTS "Teacher class scope on child_updates" ON public.child_updates;
CREATE POLICY "Teacher class scope on child_updates"
ON public.child_updates AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  student_id IS NULL
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
);

DROP POLICY IF EXISTS "Teacher class scope on child_next_focus" ON public.child_next_focus;
CREATE POLICY "Teacher class scope on child_next_focus"
ON public.child_next_focus AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "Teacher class scope on parent_students" ON public.parent_students;
CREATE POLICY "Teacher class scope on parent_students"
ON public.parent_students AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  parent_id = auth.uid()
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
);
