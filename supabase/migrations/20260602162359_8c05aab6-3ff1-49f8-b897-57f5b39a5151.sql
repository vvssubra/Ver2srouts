
CREATE OR REPLACE FUNCTION public.sync_student_program_type_from_class()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _class_program text;
BEGIN
  IF NEW.class_id IS NOT NULL THEN
    SELECT program_type INTO _class_program FROM public.classes WHERE id = NEW.class_id;
    IF _class_program IS NOT NULL THEN
      NEW.program_type := _class_program;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_program_type ON public.students;
CREATE TRIGGER trg_sync_student_program_type
BEFORE INSERT OR UPDATE OF class_id ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_program_type_from_class();
