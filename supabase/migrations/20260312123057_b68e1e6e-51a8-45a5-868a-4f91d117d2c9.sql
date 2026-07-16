
-- Add parent_connection_snippet to lesson_plans
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS parent_connection_snippet text;

-- Create parent_broadcasts table
CREATE TABLE parent_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
  class_id text,
  lesson_plan_id uuid REFERENCES lesson_plans(id) ON DELETE SET NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  attachment_urls text[] DEFAULT '{}',
  send_via_app boolean DEFAULT true,
  send_via_email boolean DEFAULT false,
  sent_by uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parent_broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own broadcasts"
  ON parent_broadcasts FOR INSERT TO authenticated
  WITH CHECK (sent_by = auth.uid());

CREATE POLICY "Users can view broadcasts in their branch"
  ON parent_broadcasts FOR SELECT TO authenticated
  USING (
    is_member_of_branch(auth.uid(), branch_id) OR is_super_admin(auth.uid())
  );
