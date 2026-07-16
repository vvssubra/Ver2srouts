
-- Add phone to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- Add health fields to students
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medical_conditions text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS dietary_notes text,
  ADD COLUMN IF NOT EXISTS blood_type text;

-- Parent messaging table
CREATE TABLE parent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id),
  sender_id uuid NOT NULL,
  recipient_id uuid,
  student_id uuid REFERENCES students(id),
  subject text NOT NULL,
  body text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Senders manage own messages" ON parent_messages FOR ALL TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Recipients read messages" ON parent_messages FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Parents read broadcasts" ON parent_messages FOR SELECT TO authenticated
  USING (recipient_id IS NULL AND EXISTS (
    SELECT 1 FROM parent_students ps
    JOIN students s ON s.id = ps.student_id
    WHERE ps.parent_id = auth.uid() AND s.branch_id = parent_messages.branch_id
  ));

CREATE POLICY "Super admins manage messages" ON parent_messages FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Branch staff manage messages" ON parent_messages FOR ALL TO authenticated
  USING (is_member_of_branch(auth.uid(), branch_id))
  WITH CHECK (is_member_of_branch(auth.uid(), branch_id));

-- RLS for parent updating student health fields
CREATE POLICY "Parents update own children health" ON students FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM parent_students ps WHERE ps.student_id = students.id AND ps.parent_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM parent_students ps WHERE ps.student_id = students.id AND ps.parent_id = auth.uid()));

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE parent_messages;
