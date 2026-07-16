
-- 1. Security definer helpers to break RLS recursion

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id uuid, _conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE user_id = _user_id AND conversation_id = _conversation_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_parent(_conversation_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT parent_id FROM public.conversations WHERE id = _conversation_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_branch(_conversation_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM public.conversations WHERE id = _conversation_id LIMIT 1
$$;

-- 2. Drop recursive policies on conversations
DROP POLICY IF EXISTS "Staff view participated conversations" ON public.conversations;
DROP POLICY IF EXISTS "Staff update participated conversations" ON public.conversations;

-- Recreate using security definer function
CREATE POLICY "Staff view participated conversations" ON public.conversations
FOR SELECT TO authenticated
USING (public.is_conversation_participant(auth.uid(), id));

CREATE POLICY "Staff update participated conversations" ON public.conversations
FOR UPDATE TO authenticated
USING (public.is_conversation_participant(auth.uid(), id));

-- 3. Drop recursive policies on conversation_participants
DROP POLICY IF EXISTS "Conversation owner view participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Franchisees view branch participants" ON public.conversation_participants;

-- Recreate using security definer functions
CREATE POLICY "Conversation owner view participants" ON public.conversation_participants
FOR SELECT TO authenticated
USING (public.get_conversation_parent(conversation_id) = auth.uid());

CREATE POLICY "Franchisees view branch participants" ON public.conversation_participants
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'franchisee'::app_role)
  AND is_member_of_branch(auth.uid(), public.get_conversation_branch(conversation_id))
);

-- 4. Drop recursive policies on chat_messages
DROP POLICY IF EXISTS "Conversation members view messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Conversation members insert messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Conversation members update read status" ON public.chat_messages;

-- Recreate using security definer functions
CREATE POLICY "Conversation members view messages" ON public.chat_messages
FOR SELECT TO authenticated
USING (
  public.is_conversation_participant(auth.uid(), conversation_id)
  OR public.get_conversation_parent(conversation_id) = auth.uid()
  OR (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), public.get_conversation_branch(conversation_id)))
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Conversation members insert messages" ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_conversation_participant(auth.uid(), conversation_id)
  OR public.get_conversation_parent(conversation_id) = auth.uid()
  OR (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), public.get_conversation_branch(conversation_id)))
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Conversation members update read status" ON public.chat_messages
FOR UPDATE TO authenticated
USING (
  public.is_conversation_participant(auth.uid(), conversation_id)
  OR public.get_conversation_parent(conversation_id) = auth.uid()
  OR (has_role(auth.uid(), 'franchisee'::app_role) AND is_member_of_branch(auth.uid(), public.get_conversation_branch(conversation_id)))
  OR is_super_admin(auth.uid())
);
