
-- Add class_name to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS class_name TEXT;

-- Add targeted announcement columns
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'all';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_class TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_parent_ids UUID[];

-- RLS: Allow recipients to update their own parent_messages (mark as read)
CREATE POLICY "Recipients update own messages"
ON public.parent_messages
FOR UPDATE
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());
