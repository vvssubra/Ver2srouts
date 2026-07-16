ALTER TABLE public.child_update_media
  ADD COLUMN IF NOT EXISTS update_skill_id uuid NULL
  REFERENCES public.child_update_skills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_child_update_media_update_skill_id
  ON public.child_update_media(update_skill_id);