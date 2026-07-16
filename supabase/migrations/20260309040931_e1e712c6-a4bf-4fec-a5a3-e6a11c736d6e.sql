
-- Create is_branch_manager helper function
CREATE OR REPLACE FUNCTION public.is_branch_manager(_user_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (has_role(_user_id, 'franchisee'::app_role) OR has_role(_user_id, 'admin'::app_role))
    AND is_member_of_branch(_user_id, _branch_id)
$$;

-- Update RLS policies to use is_branch_manager

-- accounts
DROP POLICY IF EXISTS "Franchisees manage branch accounts" ON public.accounts;
CREATE POLICY "Branch managers manage accounts" ON public.accounts FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- access_groups
DROP POLICY IF EXISTS "Franchisees manage access groups" ON public.access_groups;
CREATE POLICY "Branch managers manage access groups" ON public.access_groups FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

-- access_group_members
DROP POLICY IF EXISTS "Franchisees manage group members" ON public.access_group_members;
CREATE POLICY "Branch managers manage group members" ON public.access_group_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM access_groups ag WHERE ag.id = access_group_members.group_id AND is_branch_manager(auth.uid(), ag.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM access_groups ag WHERE ag.id = access_group_members.group_id AND is_branch_manager(auth.uid(), ag.branch_id)));

-- announcements
DROP POLICY IF EXISTS "Franchisees manage announcements" ON public.announcements;
CREATE POLICY "Branch managers manage announcements" ON public.announcements FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

DROP POLICY IF EXISTS "Franchisees delete branch announcements" ON public.announcements;
CREATE POLICY "Branch managers delete announcements" ON public.announcements FOR DELETE TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- branch_memberships
DROP POLICY IF EXISTS "Franchisees manage their branch memberships" ON public.branch_memberships;
CREATE POLICY "Branch managers insert memberships" ON public.branch_memberships FOR INSERT TO authenticated
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

DROP POLICY IF EXISTS "Franchisees delete branch memberships" ON public.branch_memberships;
CREATE POLICY "Branch managers delete memberships" ON public.branch_memberships FOR DELETE TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- branch_settings
DROP POLICY IF EXISTS "Franchisees manage branch settings" ON public.branch_settings;
CREATE POLICY "Branch managers manage branch settings" ON public.branch_settings FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- branches
DROP POLICY IF EXISTS "Franchisees can update their branch" ON public.branches;
CREATE POLICY "Branch managers update branch" ON public.branches FOR UPDATE TO authenticated
  USING (is_branch_manager(auth.uid(), id));

-- budgets
DROP POLICY IF EXISTS "Franchisees manage branch budgets" ON public.budgets;
CREATE POLICY "Branch managers manage budgets" ON public.budgets FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- credit_notes
DROP POLICY IF EXISTS "Franchisees manage credit notes" ON public.credit_notes;
CREATE POLICY "Branch managers manage credit notes" ON public.credit_notes FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- email_templates
DROP POLICY IF EXISTS "Franchisees manage email templates" ON public.email_templates;
CREATE POLICY "Branch managers manage email templates" ON public.email_templates FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

-- expenses
DROP POLICY IF EXISTS "Franchisees manage branch expenses" ON public.expenses;
CREATE POLICY "Branch managers manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- fee_package_groups
DROP POLICY IF EXISTS "Franchisees manage fee package groups" ON public.fee_package_groups;
CREATE POLICY "Branch managers manage fee package groups" ON public.fee_package_groups FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- fee_packages
DROP POLICY IF EXISTS "Franchisees manage branch fee packages" ON public.fee_packages;
CREATE POLICY "Branch managers manage fee packages" ON public.fee_packages FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- invoice_items
DROP POLICY IF EXISTS "Franchisees manage invoice items" ON public.invoice_items;
CREATE POLICY "Branch managers manage invoice items" ON public.invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND is_branch_manager(auth.uid(), i.branch_id)));

-- invoices
DROP POLICY IF EXISTS "Franchisees manage branch invoices" ON public.invoices;
CREATE POLICY "Branch managers manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- leads
DROP POLICY IF EXISTS "Franchisees manage leads" ON public.leads;
CREATE POLICY "Branch managers manage leads" ON public.leads FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));

-- leave_balances
DROP POLICY IF EXISTS "Franchisees can manage branch leave balances" ON public.leave_balances;
CREATE POLICY "Branch managers manage leave balances" ON public.leave_balances FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

DROP POLICY IF EXISTS "Franchisees can view branch leave balances" ON public.leave_balances;
CREATE POLICY "Branch managers view leave balances" ON public.leave_balances FOR SELECT TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- conversations
DROP POLICY IF EXISTS "Franchisees view branch conversations" ON public.conversations;
CREATE POLICY "Branch managers view conversations" ON public.conversations FOR SELECT TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

DROP POLICY IF EXISTS "Franchisees update branch conversations" ON public.conversations;
CREATE POLICY "Branch managers update conversations" ON public.conversations FOR UPDATE TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- conversation_participants
DROP POLICY IF EXISTS "Franchisees view branch participants" ON public.conversation_participants;
CREATE POLICY "Branch managers view participants" ON public.conversation_participants FOR SELECT TO authenticated
  USING (is_branch_manager(auth.uid(), get_conversation_branch(conversation_id)));

-- chat_messages
DROP POLICY IF EXISTS "Conversation members view messages" ON public.chat_messages;
CREATE POLICY "Conversation members view messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (is_conversation_participant(auth.uid(), conversation_id) OR (get_conversation_parent(conversation_id) = auth.uid()) OR is_branch_manager(auth.uid(), get_conversation_branch(conversation_id)) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Conversation members insert messages" ON public.chat_messages;
CREATE POLICY "Conversation members insert messages" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (is_conversation_participant(auth.uid(), conversation_id) OR (get_conversation_parent(conversation_id) = auth.uid()) OR is_branch_manager(auth.uid(), get_conversation_branch(conversation_id)) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Conversation members update read status" ON public.chat_messages;
CREATE POLICY "Conversation members update read status" ON public.chat_messages FOR UPDATE TO authenticated
  USING (is_conversation_participant(auth.uid(), conversation_id) OR (get_conversation_parent(conversation_id) = auth.uid()) OR is_branch_manager(auth.uid(), get_conversation_branch(conversation_id)) OR is_super_admin(auth.uid()));

-- audit_responses
DROP POLICY IF EXISTS "Franchisees update corrective fields" ON public.audit_responses;
CREATE POLICY "Branch managers update corrective fields" ON public.audit_responses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM branch_audits ba WHERE ba.id = audit_responses.audit_id AND is_branch_manager(auth.uid(), ba.branch_id)));

DROP POLICY IF EXISTS "Franchisees view own branch audit responses" ON public.audit_responses;
CREATE POLICY "Branch managers view audit responses" ON public.audit_responses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM branch_audits ba WHERE ba.id = audit_responses.audit_id AND is_branch_manager(auth.uid(), ba.branch_id)));

-- branch_audits
DROP POLICY IF EXISTS "Franchisees view own branch audits" ON public.branch_audits;
CREATE POLICY "Branch managers view branch audits" ON public.branch_audits FOR SELECT TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id));

-- newsletters
DROP POLICY IF EXISTS "Franchisees manage newsletters" ON public.newsletters;
CREATE POLICY "Branch managers manage newsletters" ON public.newsletters FOR ALL TO authenticated
  USING (is_branch_manager(auth.uid(), branch_id))
  WITH CHECK (is_branch_manager(auth.uid(), branch_id));
