
-- 1. Extend push_subscriptions
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS platform text;

-- 2. Delivery logs
CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid,
  user_id uuid,
  endpoint text,
  status text NOT NULL,
  response_code int,
  response_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.push_delivery_logs TO authenticated;
GRANT ALL ON public.push_delivery_logs TO service_role;

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can read push logs" ON public.push_delivery_logs;
CREATE POLICY "Super admins can read push logs"
  ON public.push_delivery_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS push_delivery_logs_user_idx
  ON public.push_delivery_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_delivery_logs_notif_idx
  ON public.push_delivery_logs(notification_id);

-- 3. Improved trigger function
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-push-notification';
BEGIN
  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    RAISE LOG 'notify_push_on_insert: service_role_key not found in vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'url', NEW.action_url,
      'group_key', NEW.group_key,
      'notification_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_push_on_insert error: %', SQLERRM;
  RETURN NEW;
END;
$$;
