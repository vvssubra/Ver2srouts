
-- Add wellbeing & language fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS quiet_hours_start time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quiet_hours_end time DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_quiet_hours_enabled boolean NOT NULL DEFAULT false;

-- Add translated_text and read_at to chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS translated_text jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- Table: announcements
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: announcement_reads
CREATE TABLE public.announcement_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  parent_user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, parent_user_id)
);

-- Enable RLS
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS: announcements
CREATE POLICY "Branch members view announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Parents view branch announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN students s ON s.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND s.branch_id = announcements.branch_id
  ));

CREATE POLICY "Franchisees manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- RLS: announcement_reads
CREATE POLICY "Parents insert own reads" ON public.announcement_reads
  FOR INSERT TO authenticated
  WITH CHECK (parent_user_id = auth.uid());

CREATE POLICY "Parents view own reads" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

CREATE POLICY "Staff view announcement reads" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM announcements a
    WHERE a.id = announcement_reads.announcement_id
    AND is_member_of_branch(auth.uid(), a.branch_id)
  ));

CREATE POLICY "Super admins manage reads" ON public.announcement_reads
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- Allow chat_messages update for read receipts
CREATE POLICY "Conversation members update read status" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conversations c
    LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
    WHERE c.id = chat_messages.conversation_id
      AND (c.parent_id = auth.uid() OR cp.user_id = auth.uid()
           OR (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), c.branch_id))
           OR is_super_admin(auth.uid()))
  ));
