
CREATE TABLE public.learning_albums (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  class_id UUID REFERENCES public.classes(id),
  created_by UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.learning_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  album_id UUID REFERENCES public.learning_albums(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id),
  title TEXT NOT NULL,
  description TEXT,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  domain_id UUID REFERENCES public.development_domains(id),
  lesson_plan_id UUID,
  visible_to_parents BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.learning_activity_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.learning_activities(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  thumbnail_url TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.learning_activity_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES public.learning_activities(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(activity_id, student_id)
);

ALTER TABLE public.learning_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activity_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activity_students ENABLE ROW LEVEL SECURITY;

-- Albums RLS
CREATE POLICY "staff_view_albums" ON public.learning_albums FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "managers_create_albums" ON public.learning_albums FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "managers_update_albums" ON public.learning_albums FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id));

CREATE POLICY "managers_delete_albums" ON public.learning_albums FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_branch_manager(auth.uid(), branch_id));

-- Activities RLS
CREATE POLICY "staff_view_activities" ON public.learning_activities FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "parents_view_shared_activities" ON public.learning_activities FOR SELECT TO authenticated
  USING (
    visible_to_parents = true
    AND EXISTS (
      SELECT 1 FROM public.learning_activity_students las
      JOIN public.parent_students ps ON ps.student_id = las.student_id
      WHERE las.activity_id = learning_activities.id
        AND ps.parent_id = auth.uid()
        AND ps.status = 'approved'
    )
  );

CREATE POLICY "staff_create_activities" ON public.learning_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "staff_update_activities" ON public.learning_activities FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "staff_delete_activities" ON public.learning_activities FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

-- Media RLS
CREATE POLICY "view_media" ON public.learning_activity_media FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.is_member_of_branch(auth.uid(), la.branch_id)
        OR (la.visible_to_parents = true AND EXISTS (
          SELECT 1 FROM public.learning_activity_students las
          JOIN public.parent_students ps ON ps.student_id = las.student_id
          WHERE las.activity_id = la.id AND ps.parent_id = auth.uid() AND ps.status = 'approved'
        ))
      )
    )
  );

CREATE POLICY "staff_manage_media" ON public.learning_activity_media FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), la.branch_id))
    )
  );

CREATE POLICY "staff_update_media" ON public.learning_activity_media FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), la.branch_id))
    )
  );

CREATE POLICY "staff_delete_media" ON public.learning_activity_media FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), la.branch_id))
    )
  );

-- Student tags RLS
CREATE POLICY "view_student_tags" ON public.learning_activity_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.is_member_of_branch(auth.uid(), la.branch_id)
        OR (la.visible_to_parents = true AND EXISTS (
          SELECT 1 FROM public.parent_students ps
          WHERE ps.student_id = learning_activity_students.student_id
          AND ps.parent_id = auth.uid() AND ps.status = 'approved'
        ))
      )
    )
  );

CREATE POLICY "staff_manage_student_tags" ON public.learning_activity_students FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), la.branch_id))
    )
  );

CREATE POLICY "staff_delete_student_tags" ON public.learning_activity_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_activities la
      WHERE la.id = activity_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), la.branch_id))
    )
  );

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('learning-media', 'learning-media', true);

CREATE POLICY "upload_learning_media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'learning-media');

CREATE POLICY "view_learning_media" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'learning-media');

CREATE POLICY "delete_learning_media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'learning-media');
