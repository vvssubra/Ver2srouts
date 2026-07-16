ALTER TABLE public.parent_students
ADD CONSTRAINT parent_students_parent_id_fkey
FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;