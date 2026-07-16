-- 1. Multi-skill tags per Moment
CREATE TABLE IF NOT EXISTS public.child_update_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.child_updates(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.development_domains(id) ON DELETE SET NULL,
  indicator_id uuid,
  proficiency_level text CHECK (proficiency_level IN ('TP1','TP2','TP3')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_child_update_skills_update ON public.child_update_skills(update_id);
ALTER TABLE public.child_update_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view skills on visible moments"
  ON public.child_update_skills FOR SELECT
  USING (public.can_user_view_child_update(update_id, auth.uid()));

CREATE POLICY "staff manage skills in branch"
  ON public.child_update_skills FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = update_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), cu.branch_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.child_updates cu
    WHERE cu.id = update_id
      AND (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), cu.branch_id))
  ));

-- 2. Daily journey summary
CREATE TABLE IF NOT EXISTS public.daily_journey_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  day date NOT NULL,
  summary text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_journey_summaries_sd ON public.daily_journey_summaries(student_id, day);
ALTER TABLE public.daily_journey_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view summaries in branch"
  ON public.daily_journey_summaries FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "parents view summaries for own child"
  ON public.daily_journey_summaries FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = daily_journey_summaries.student_id
      AND ps.parent_id = auth.uid()
      AND ps.status = 'approved'
  ));

CREATE POLICY "staff manage summaries in branch"
  ON public.daily_journey_summaries FOR ALL
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_daily_journey_summaries_updated
BEFORE UPDATE ON public.daily_journey_summaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Pickup change requests
CREATE TABLE IF NOT EXISTS public.pickup_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  pickup_date date NOT NULL,
  pickup_person_name text NOT NULL,
  pickup_person_phone text NOT NULL,
  relationship text,
  ic_number text,
  notes text,
  status text NOT NULL DEFAULT 'notified' CHECK (status IN ('notified','acknowledged','cancelled')),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pickup_changes_branch_date ON public.pickup_changes(branch_id, pickup_date);
CREATE INDEX IF NOT EXISTS idx_pickup_changes_student ON public.pickup_changes(student_id);
ALTER TABLE public.pickup_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parents manage own pickup changes"
  ON public.pickup_changes FOR ALL
  USING (parent_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = pickup_changes.student_id
      AND ps.parent_id = auth.uid()
      AND ps.status = 'approved'
  ))
  WITH CHECK (parent_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.parent_students ps
    WHERE ps.student_id = pickup_changes.student_id
      AND ps.parent_id = auth.uid()
      AND ps.status = 'approved'
  ));

CREATE POLICY "staff view pickup changes in branch"
  ON public.pickup_changes FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "staff update pickup changes in branch"
  ON public.pickup_changes FOR UPDATE
  USING (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_member_of_branch(auth.uid(), branch_id));

CREATE TRIGGER trg_pickup_changes_updated
BEFORE UPDATE ON public.pickup_changes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notify branch staff when parent files a pickup change
CREATE OR REPLACE FUNCTION public.notify_pickup_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_name text;
BEGIN
  SELECT first_name || ' ' || COALESCE(last_name,'') INTO v_student_name
  FROM public.students WHERE id = NEW.student_id;

  PERFORM public.notify_approvers(
    _branch_id := NEW.branch_id,
    _exclude_user_id := NEW.parent_id,
    _title := 'Pickup change requested',
    _message := COALESCE(v_student_name,'A child') || ' will be picked up by '
                || NEW.pickup_person_name || ' (' || NEW.pickup_person_phone || ') on '
                || to_char(NEW.pickup_date,'DD Mon YYYY'),
    _type := 'pickup_change',
    _action_url := '/check-in?pickup=' || NEW.id::text,
    _reference_id := NEW.id,
    _group_key := 'pickup_' || NEW.id::text,
    _priority := 'high'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_pickup_change
AFTER INSERT ON public.pickup_changes
FOR EACH ROW EXECUTE FUNCTION public.notify_pickup_change();

-- 4. FK so PostgREST can embed comment author profile
ALTER TABLE public.moment_comments
  ADD CONSTRAINT moment_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.moment_reactions
  ADD CONSTRAINT moment_reactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
