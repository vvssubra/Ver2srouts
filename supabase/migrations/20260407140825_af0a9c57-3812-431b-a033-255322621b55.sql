
-- Add group_key, priority, and archived_at columns to notifications
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS group_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Add indexes for fast feed queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON public.notifications (group_key) WHERE group_key IS NOT NULL;

-- Create a SECURITY DEFINER function to safely resolve branch approvers
-- This bypasses RLS so any user (including teachers) can trigger notifications to managers
CREATE OR REPLACE FUNCTION public.get_branch_approver_ids(_branch_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT bm.user_id),
    '{}'::uuid[]
  )
  FROM branch_memberships bm
  JOIN user_roles ur ON ur.user_id = bm.user_id
  WHERE bm.branch_id = _branch_id
    AND ur.role IN ('franchisee', 'admin', 'super_admin')
$$;

-- Create a function to batch-insert notifications with dedupe support
CREATE OR REPLACE FUNCTION public.notify_approvers(
  _branch_id uuid,
  _exclude_user_id uuid,
  _title text,
  _message text,
  _type text,
  _action_url text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,
  _group_key text DEFAULT NULL,
  _priority text DEFAULT 'normal'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _approver_ids uuid[];
  _uid uuid;
BEGIN
  _approver_ids := get_branch_approver_ids(_branch_id);
  
  FOREACH _uid IN ARRAY _approver_ids
  LOOP
    IF _uid IS DISTINCT FROM _exclude_user_id THEN
      -- Dedupe: skip if same group_key exists and is unread within last hour
      IF _group_key IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM notifications
          WHERE user_id = _uid
            AND group_key = _group_key
            AND is_read = false
            AND created_at > now() - interval '1 hour'
        ) THEN
          CONTINUE;
        END IF;
      END IF;
      
      INSERT INTO notifications (user_id, title, message, type, action_url, reference_id, group_key, priority)
      VALUES (_uid, _title, _message, _type, _action_url, _reference_id, _group_key, _priority);
    END IF;
  END LOOP;
END;
$$;
