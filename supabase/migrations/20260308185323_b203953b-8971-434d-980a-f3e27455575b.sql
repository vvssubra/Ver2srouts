
-- Table: conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id),
  student_id uuid NOT NULL REFERENCES public.students(id),
  parent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  subject text NOT NULL DEFAULT '',
  ai_intent_tag text DEFAULT 'general',
  ai_sentiment text DEFAULT 'neutral',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: chat_messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  text_body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: conversation_participants
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- RLS: conversations
CREATE POLICY "Parents manage own conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Staff view participated conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Staff update participated conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Franchisees view branch conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Franchisees update branch conversations" ON public.conversations
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), branch_id));

CREATE POLICY "Super admins manage conversations" ON public.conversations
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- RLS: chat_messages
CREATE POLICY "Conversation members view messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id
    WHERE c.id = chat_messages.conversation_id
      AND (c.parent_id = auth.uid() OR cp.user_id = auth.uid()
           OR (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), c.branch_id))
           OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Conversation members insert messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id
    WHERE c.id = chat_messages.conversation_id
      AND (c.parent_id = auth.uid() OR cp.user_id = auth.uid()
           OR (has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), c.branch_id))
           OR is_super_admin(auth.uid()))
  ));

CREATE POLICY "Super admins manage chat messages" ON public.chat_messages
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- RLS: conversation_participants
CREATE POLICY "Participants view own" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Conversation owner view participants" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id AND c.parent_id = auth.uid()
  ));

CREATE POLICY "Franchisees view branch participants" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
      AND has_role(auth.uid(), 'franchisee') AND is_member_of_branch(auth.uid(), c.branch_id)
  ));

CREATE POLICY "Super admins manage participants" ON public.conversation_participants
  FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Updated_at trigger
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
