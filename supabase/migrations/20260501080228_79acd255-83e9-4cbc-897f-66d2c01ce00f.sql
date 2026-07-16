
ALTER TABLE public.student_observations
  ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES public.learning_albums(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_student_observations_album_id
  ON public.student_observations(album_id);

-- Parent visibility on albums: a parent may read an album if any visible activity
-- under it tags one of their approved children.
CREATE OR REPLACE FUNCTION public.can_parent_view_learning_album(_album_id uuid, _parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.learning_activities la
    JOIN public.learning_activity_students las ON las.activity_id = la.id
    JOIN public.parent_students ps ON ps.student_id = las.student_id
    WHERE la.album_id = _album_id
      AND la.visible_to_parents = true
      AND ps.parent_id = _parent_id
      AND ps.status = 'approved'
  );
$$;

DROP POLICY IF EXISTS parents_view_shared_albums ON public.learning_albums;
CREATE POLICY parents_view_shared_albums
ON public.learning_albums
FOR SELECT
TO authenticated
USING (public.can_parent_view_learning_album(id, auth.uid()));
