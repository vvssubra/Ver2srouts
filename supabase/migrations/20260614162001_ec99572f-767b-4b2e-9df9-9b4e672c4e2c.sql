
-- =========================================================================
-- Batch 6F-B-5: Teacher write scoping (defense-in-depth) +
-- timetable notification leak fix.
-- Uses the helpers added in Batch 6F-B-3:
--   public.is_teacher_blocked_from_class(user, branch, class)
--   public.is_teacher_blocked_from_student(user, student)
-- These return false for non-teachers, super_admins, branch managers, and
-- teachers with no class assignment, so the new restrictive policies are
-- a no-op for everyone except plain teachers with class restrictions.
-- =========================================================================

-- --- child_updates (student-anchored) ----------------------------------
DROP POLICY IF EXISTS "Teacher class scope write child_updates" ON public.child_updates;
CREATE POLICY "Teacher class scope write child_updates"
ON public.child_updates AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  student_id IS NULL
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
)
WITH CHECK (
  student_id IS NULL
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
);

-- --- child_update_students (group moment links) ------------------------
DROP POLICY IF EXISTS "Teacher class scope write child_update_students"
  ON public.child_update_students;
CREATE POLICY "Teacher class scope write child_update_students"
ON public.child_update_students AS RESTRICTIVE
FOR ALL TO authenticated
USING (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id))
WITH CHECK (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id));

-- --- child_update_media / child_update_skills --------------------------
-- These already gate on the parent child_updates row's branch. Add an
-- explicit teacher class check via the parent update's student_id.
DROP POLICY IF EXISTS "Teacher class scope write child_update_media"
  ON public.child_update_media;
CREATE POLICY "Teacher class scope write child_update_media"
ON public.child_update_media AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = child_update_media.update_id
      AND (
        cu.student_id IS NULL
        OR NOT public.is_teacher_blocked_from_student(auth.uid(), cu.student_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = child_update_media.update_id
      AND (
        cu.student_id IS NULL
        OR NOT public.is_teacher_blocked_from_student(auth.uid(), cu.student_id)
      )
  )
);

DROP POLICY IF EXISTS "Teacher class scope write child_update_skills"
  ON public.child_update_skills;
CREATE POLICY "Teacher class scope write child_update_skills"
ON public.child_update_skills AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = child_update_skills.update_id
      AND (
        cu.student_id IS NULL
        OR NOT public.is_teacher_blocked_from_student(auth.uid(), cu.student_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = child_update_skills.update_id
      AND (
        cu.student_id IS NULL
        OR NOT public.is_teacher_blocked_from_student(auth.uid(), cu.student_id)
      )
  )
);

-- --- child_skill_progress ----------------------------------------------
DROP POLICY IF EXISTS "Teacher class scope write child_skill_progress"
  ON public.child_skill_progress;
CREATE POLICY "Teacher class scope write child_skill_progress"
ON public.child_skill_progress AS RESTRICTIVE
FOR ALL TO authenticated
USING (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id))
WITH CHECK (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id));

-- --- child_next_focus + evidence ---------------------------------------
DROP POLICY IF EXISTS "Teacher class scope write child_next_focus"
  ON public.child_next_focus;
CREATE POLICY "Teacher class scope write child_next_focus"
ON public.child_next_focus AS RESTRICTIVE
FOR ALL TO authenticated
USING (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id))
WITH CHECK (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "Teacher class scope write child_next_focus_evidence"
  ON public.child_next_focus_evidence;
CREATE POLICY "Teacher class scope write child_next_focus_evidence"
ON public.child_next_focus_evidence AS RESTRICTIVE
FOR ALL TO authenticated
USING (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id))
WITH CHECK (NOT public.is_teacher_blocked_from_student(auth.uid(), student_id));

-- --- students (UPDATE/DELETE; INSERT remains permissive for enrolment) -
DROP POLICY IF EXISTS "Teacher class scope write students" ON public.students;
CREATE POLICY "Teacher class scope write students"
ON public.students AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (NOT public.is_teacher_blocked_from_class(auth.uid(), branch_id, class_id))
WITH CHECK (NOT public.is_teacher_blocked_from_class(auth.uid(), branch_id, class_id));

-- --- parent_students (staff writes) ------------------------------------
DROP POLICY IF EXISTS "Teacher class scope write parent_students"
  ON public.parent_students;
CREATE POLICY "Teacher class scope write parent_students"
ON public.parent_students AS RESTRICTIVE
FOR ALL TO authenticated
USING (
  parent_id = auth.uid()
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
)
WITH CHECK (
  parent_id = auth.uid()
  OR NOT public.is_teacher_blocked_from_student(auth.uid(), student_id)
);

-- =========================================================================
-- Notification sweep: timetable_change leak — teachers without an
-- assigned_class_ids array previously received every timetable change in
-- their branch. Tighten to require the affected class to actually be in
-- the teacher's assignment.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.notify_timetable_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _class_name text;
  _branch_id uuid;
  _action_label text;
  _slot_date text;
  _subject text;
  _class_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _branch_id := OLD.branch_id;
    _slot_date := OLD.slot_date::text;
    _subject := OLD.subject_name;
    _action_label := 'removed';
  ELSE
    _branch_id := NEW.branch_id;
    _slot_date := NEW.slot_date::text;
    _subject := NEW.subject_name;
    IF TG_OP = 'INSERT' AND COALESCE(NEW.is_modified, false) = false THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
    _action_label := CASE WHEN TG_OP = 'INSERT' THEN 'added' ELSE 'updated' END;
  END IF;

  _class_id := COALESCE(NEW.class_id, OLD.class_id);

  SELECT class_name INTO _class_name
  FROM public.classes
  WHERE id = _class_id
  LIMIT 1;

  -- Super admins
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
  SELECT ur.user_id,
    'Timetable ' || initcap(_action_label),
    _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
    'timetable_change',
    COALESCE(NEW.id, OLD.id),
    '/timetables'
  FROM public.user_roles ur
  WHERE ur.role = 'super_admin';

  -- Branch managers (admin / franchisee)
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
  SELECT DISTINCT bm.user_id,
    'Timetable ' || initcap(_action_label),
    _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
    'timetable_change',
    COALESCE(NEW.id, OLD.id),
    '/timetables'
  FROM public.branch_memberships bm
  JOIN public.user_roles ur ON ur.user_id = bm.user_id
  WHERE bm.branch_id = _branch_id
    AND ur.role IN ('franchisee', 'admin')
    AND NOT EXISTS (SELECT 1 FROM public.user_roles ur2 WHERE ur2.user_id = bm.user_id AND ur2.role = 'super_admin');

  -- Teachers: require the affected class to be in their assigned_class_ids.
  -- Removed the previous "assigned_class_ids IS NULL → notify" fallback.
  IF _class_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, reference_id, action_url)
    SELECT DISTINCT bm.user_id,
      'Timetable ' || initcap(_action_label),
      _subject || ' slot ' || _action_label || ' on ' || _slot_date || ' for ' || COALESCE(_class_name, 'class') || '.',
      'timetable_change',
      COALESCE(NEW.id, OLD.id),
      '/timetables'
    FROM public.branch_memberships bm
    JOIN public.user_roles ur ON ur.user_id = bm.user_id
    WHERE bm.branch_id = _branch_id
      AND ur.role = 'teacher'
      AND bm.assigned_class_ids IS NOT NULL
      AND _class_id = ANY(bm.assigned_class_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur2
        WHERE ur2.user_id = bm.user_id
          AND ur2.role IN ('super_admin', 'franchisee', 'admin')
      );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
