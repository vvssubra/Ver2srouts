create extension if not exists pg_net with schema extensions;

alter table public.push_subscriptions
  add column if not exists last_seen_at timestamptz,
  add column if not exists user_agent text,
  add column if not exists platform text;

create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);
create index if not exists idx_push_subscriptions_last_seen_at
  on public.push_subscriptions(last_seen_at desc);

create table if not exists public.push_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid null,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text null,
  status text not null,
  response_code integer null,
  response_body text null,
  created_at timestamptz not null default now()
);

grant select on public.push_delivery_logs to authenticated;
grant all on public.push_delivery_logs to service_role;

create index if not exists idx_push_delivery_logs_user_id_created_at
  on public.push_delivery_logs(user_id, created_at desc);
create index if not exists idx_push_delivery_logs_notification_id
  on public.push_delivery_logs(notification_id);
create index if not exists idx_push_delivery_logs_status_created_at
  on public.push_delivery_logs(status, created_at desc);

alter table public.push_delivery_logs enable row level security;

drop policy if exists "Super admins can read push delivery logs"
  on public.push_delivery_logs;
create policy "Super admins can read push delivery logs"
  on public.push_delivery_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'super_admin'
    )
  );

drop trigger if exists on_notification_insert_push on public.notifications;

create or replace function public.notify_push_on_insert()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'extensions', 'vault'
as $$
declare
  _service_key text;
  _url text := 'https://jrelnkamglefuztemczq.supabase.co/functions/v1/send-push-notification';
begin
  select decrypted_secret
    into _service_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if _service_key is null then
    raise log 'notify_push_on_insert: service_role_key not found in vault';
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
$$;

create trigger on_notification_insert_push
  after insert on public.notifications
  for each row
  execute function public.notify_push_on_insert();

create index if not exists idx_chat_messages_unread_by_conversation
  on public.chat_messages(conversation_id, is_read, read_at, sender_id);

create index if not exists idx_notifications_user_group_unread
  on public.notifications(user_id, group_key, is_read)
  where archived_at is null;