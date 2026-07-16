
ALTER TABLE public.learning_albums
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS learning_albums_personal_uniq
  ON public.learning_albums(student_id) WHERE is_personal;

CREATE INDEX IF NOT EXISTS idx_learning_albums_student ON public.learning_albums(student_id);

-- Backfill: one personal album per active student. Use a system super_admin as creator.
INSERT INTO public.learning_albums (branch_id, title, student_id, is_personal, created_by, class_id)
SELECT s.branch_id,
       COALESCE(s.first_name, 'Child') || '''s album',
       s.id,
       true,
       (SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1),
       s.class_id
FROM public.students s
WHERE s.is_active = true
  AND s.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.learning_albums la
    WHERE la.student_id = s.id AND la.is_personal = true
  );

-- Trigger: create personal album when a new student is added
CREATE OR REPLACE FUNCTION public.ensure_personal_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.learning_albums (branch_id, title, student_id, is_personal, created_by, class_id)
  VALUES (
    NEW.branch_id,
    COALESCE(NEW.first_name, 'Child') || '''s album',
    NEW.id,
    true,
    COALESCE(auth.uid(), (SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1)),
    NEW.class_id
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_personal_album ON public.students;
CREATE TRIGGER trg_ensure_personal_album
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_personal_album();
