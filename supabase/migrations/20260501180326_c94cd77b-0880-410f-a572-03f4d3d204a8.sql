
-- Moments reactions and comments tables (Daily Updates v3)

CREATE TABLE IF NOT EXISTS public.moment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'heart',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (update_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_moment_reactions_update ON public.moment_reactions(update_id);

CREATE TABLE IF NOT EXISTS public.moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moment_comments_update ON public.moment_comments(update_id);

ALTER TABLE public.moment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_comments ENABLE ROW LEVEL SECURITY;

-- Reactions policies
CREATE POLICY "view reactions on visible moments"
  ON public.moment_reactions FOR SELECT
  USING (public.can_user_view_child_update(update_id, auth.uid()));

CREATE POLICY "react on visible moments"
  ON public.moment_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_user_view_child_update(update_id, auth.uid())
  );

CREATE POLICY "remove own reaction"
  ON public.moment_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Comments policies
CREATE POLICY "view comments on visible moments"
  ON public.moment_comments FOR SELECT
  USING (public.can_user_view_child_update(update_id, auth.uid()));

CREATE POLICY "comment on visible moments"
  ON public.moment_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND public.can_user_view_child_update(update_id, auth.uid())
  );

CREATE POLICY "edit own comment"
  ON public.moment_comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "delete own comment or staff in branch"
  ON public.moment_comments FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.child_updates cu
      WHERE cu.id = update_id
        AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), cu.branch_id))
    )
  );

CREATE TRIGGER trg_moment_comments_updated
  BEFORE UPDATE ON public.moment_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify the Moment author + class teachers when a parent comments / reacts
CREATE OR REPLACE FUNCTION public.notify_moment_author_on_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_update RECORD;
  v_author_name text;
  v_student_name text;
  v_actor_role app_role;
  v_message text;
  v_kind text := TG_ARGV[0]; -- 'comment' or 'reaction'
  v_actor_id uuid;
BEGIN
  v_actor_id := CASE WHEN v_kind = 'comment' THEN NEW.author_id ELSE NEW.user_id END;

  SELECT cu.*, s.first_name, s.last_name
    INTO v_update
  FROM public.child_updates cu
  LEFT JOIN public.students s ON s.id = cu.student_id
  WHERE cu.id = NEW.update_id;

  IF v_update.id IS NULL THEN RETURN NEW; END IF;

  -- Only notify when a PARENT engages (avoid teacher self-notifications)
  SELECT role INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor_id LIMIT 1;
  IF v_actor_role IS DISTINCT FROM 'parent' THEN RETURN NEW; END IF;

  v_student_name := COALESCE(v_update.first_name, 'a child');
  v_message := CASE WHEN v_kind = 'comment'
                    THEN 'A parent commented on your update for ' || v_student_name
                    ELSE 'A parent reacted to your update for ' || v_student_name END;

  IF v_update.created_by IS NOT NULL AND v_update.created_by <> v_actor_id THEN
    INSERT INTO public.notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
    VALUES (
      v_update.created_by,
      'New parent ' || v_kind,
      v_message,
      'moment_engagement',
      '/moments?update=' || v_update.id::text,
      v_update.id,
      'moment_eng_' || v_update.id::text || '_' || v_kind,
      'normal'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_moment_comment
  AFTER INSERT ON public.moment_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_moment_author_on_engagement('comment');

CREATE TRIGGER trg_notify_moment_reaction
  AFTER INSERT ON public.moment_reactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_moment_author_on_engagement('reaction');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.moment_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.moment_comments;
