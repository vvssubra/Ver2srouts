
CREATE TABLE IF NOT EXISTS public.student_observation_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  observation_id UUID NOT NULL REFERENCES public.student_observations(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  thumbnail_url TEXT,
  caption TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_observation_media_observation_id
  ON public.student_observation_media(observation_id);

ALTER TABLE public.student_observation_media ENABLE ROW LEVEL SECURITY;

-- Helper: can the current user see the parent observation
CREATE OR REPLACE FUNCTION public.can_user_view_observation(_obs_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_observations o
    JOIN public.students s ON s.id = o.student_id
    WHERE o.id = _obs_id
      AND (
        public.is_super_admin(_user_id)
        OR public.is_member_of_branch(_user_id, s.branch_id)
        OR (
          o.is_shared_with_parent = true
          AND EXISTS (
            SELECT 1 FROM public.parent_students ps
            WHERE ps.student_id = o.student_id
              AND ps.parent_id = _user_id
              AND ps.status = 'approved'
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_staff_modify_observation(_obs_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_observations o
    JOIN public.students s ON s.id = o.student_id
    WHERE o.id = _obs_id
      AND (
        public.is_super_admin(_user_id)
        OR public.is_member_of_branch(_user_id, s.branch_id)
      )
  );
$$;

DROP POLICY IF EXISTS "view_observation_media" ON public.student_observation_media;
CREATE POLICY "view_observation_media"
ON public.student_observation_media
FOR SELECT
TO authenticated
USING (public.can_user_view_observation(observation_id, auth.uid()));

DROP POLICY IF EXISTS "staff_insert_observation_media" ON public.student_observation_media;
CREATE POLICY "staff_insert_observation_media"
ON public.student_observation_media
FOR INSERT
TO authenticated
WITH CHECK (public.can_staff_modify_observation(observation_id, auth.uid()));

DROP POLICY IF EXISTS "staff_update_observation_media" ON public.student_observation_media;
CREATE POLICY "staff_update_observation_media"
ON public.student_observation_media
FOR UPDATE
TO authenticated
USING (public.can_staff_modify_observation(observation_id, auth.uid()));

DROP POLICY IF EXISTS "staff_delete_observation_media" ON public.student_observation_media;
CREATE POLICY "staff_delete_observation_media"
ON public.student_observation_media
FOR DELETE
TO authenticated
USING (public.can_staff_modify_observation(observation_id, auth.uid()));
