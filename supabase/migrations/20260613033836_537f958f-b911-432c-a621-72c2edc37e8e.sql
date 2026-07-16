CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $function$
declare
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-push-notification';
begin
  select decrypted_secret
    into _service_key
  from vault.decrypted_secrets
  where name in ('service_role_key', 'email_queue_service_role_key')
  order by case name when 'service_role_key' then 0 else 1 end
  limit 1;

  if _service_key is null then
    raise log 'notify_push_on_insert: no service role key found in vault';
    return new;
  end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'message', new.message,
      'type', new.type,
      'url', new.action_url,
      'group_key', new.group_key,
      'notification_id', new.id
    )
  );

  return new;
exception when others then
  raise log 'notify_push_on_insert error: %', sqlerrm;
  return new;
end;
$function$;