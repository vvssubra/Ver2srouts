DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_album_id_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_album_id_fkey
      FOREIGN KEY (album_id) REFERENCES public.learning_albums(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_student_id_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_class_id_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_class_id_fkey
      FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_domain_id_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_domain_id_fkey
      FOREIGN KEY (domain_id) REFERENCES public.development_domains(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_branch_id_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'child_updates_created_by_fkey') THEN
    ALTER TABLE public.child_updates
      ADD CONSTRAINT child_updates_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;