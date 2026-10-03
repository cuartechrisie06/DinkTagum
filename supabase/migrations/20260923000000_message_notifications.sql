-- Chat messages previously created no notification at all — only reservations
-- did (see private.create_reservation_notification). This adds one, collapsed
-- to a single row per (recipient, conversation) so an active back-and-forth
-- conversation doesn't spam the notification center with one row per message.

alter table public.notifications add column if not exists related_id uuid;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reservation', 'game_invitation', 'community', 'system', 'message', 'connection'));

-- Partial unique index: only 'message' notifications are collapsed per
-- (recipient, conversation); every other kind keeps its existing one-row-per-event behavior.
create unique index if not exists notifications_recipient_message_conversation_idx
  on public.notifications (recipient_id, related_id)
  where kind = 'message';

create or replace function private.create_message_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  sender_name text;
begin
  select case when c.user_a = new.sender_id then c.user_b else c.user_a end
  into recipient
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient is null then
    return new;
  end if;

  select display_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (recipient_id, kind, title, body, related_id, is_read, created_at)
  values (
    recipient,
    'message',
    coalesce(sender_name, 'A player') || ' sent you a message',
    left(new.content, 120),
    new.conversation_id,
    false,
    now()
  )
  on conflict (recipient_id, related_id) where kind = 'message'
  do update set title = excluded.title, body = excluded.body, is_read = false, created_at = now();

  return new;
end;
$$;

revoke all on function private.create_message_notification() from public, anon, authenticated;
drop trigger if exists messages_create_notification on public.messages;
create trigger messages_create_notification
  after insert on public.messages
  for each row execute function private.create_message_notification();
