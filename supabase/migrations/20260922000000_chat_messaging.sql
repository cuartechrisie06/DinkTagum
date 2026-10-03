-- Real-time direct messaging between two players.
--
-- Design notes:
-- * One-to-one conversations only (matches the app's existing "Find Players"
--   directory; there is no group-chat concept anywhere else in the schema).
-- * `conversations.user_a`/`user_b` are always stored as (least(a,b), greatest(a,b))
--   so a unique index on that pair guarantees at most one conversation exists
--   between any two users, even under concurrent "start chat" taps.
-- * FKs point at auth.users(id), matching every other user-referencing table in
--   this schema (reservations, game_records, community_posts, notifications).
--   Profile display data is looked up separately and tolerates a missing row,
--   the same way CommunityFeedContext already falls back to a generic label.
-- * All writes go through SECURITY DEFINER functions (find_or_create_direct_conversation,
--   mark_conversation_read) so RLS only ever has to answer "can this row be read/inserted",
--   never "can this row be created with an arbitrary shape".

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_read_a timestamptz not null default now(),
  last_read_b timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_distinct_users check (user_a <> user_b)
);

create unique index if not exists conversations_pair_idx
  on public.conversations (least(user_a, user_b), greatest(user_a, user_b));
create index if not exists conversations_user_a_idx on public.conversations (user_a);
create index if not exists conversations_user_b_idx on public.conversations (user_b);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations, public.messages from anon, authenticated;

-- Only SELECT is granted directly: conversations are created and marked-read
-- exclusively through the SECURITY DEFINER functions below. Messages are
-- inserted directly (a plain, cheap RLS check), never updated or deleted.
grant select on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (user_a = (select auth.uid()) or user_b = (select auth.uid()));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = (select auth.uid()) or c.user_b = (select auth.uid()))
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.user_a = (select auth.uid()) or c.user_b = (select auth.uid()))
    )
  );

-- Finds the existing 1:1 conversation with other_user_id, or atomically creates
-- one. The unique index + ON CONFLICT makes this race-safe if both players tap
-- "message" on each other at the same moment.
create or replace function public.find_or_create_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  convo_id uuid;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Cannot start a conversation with yourself' using errcode = '22023';
  end if;

  -- A non-existent other_user_id is rejected by the user_b/user_a foreign key
  -- constraint below (sqlstate 23503) rather than a separate existence check.
  insert into public.conversations (user_a, user_b)
  values (least(me, other_user_id), greatest(me, other_user_id))
  on conflict (least(user_a, user_b), greatest(user_a, user_b))
  do update set user_a = excluded.user_a
  returning id into convo_id;

  return convo_id;
end;
$$;

revoke all on function public.find_or_create_direct_conversation(uuid) from public, anon, authenticated;
grant execute on function public.find_or_create_direct_conversation(uuid) to authenticated;

-- Marks the caller's own side of a conversation as read. Ignores any
-- conversation the caller does not belong to, and can never touch the other
-- participant's last_read column. Uses clock_timestamp() rather than now()
-- since this records the actual instant of the call, not the start of the
-- enclosing transaction (now() is frozen for a transaction's whole duration).
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  update public.conversations
  set last_read_a = case when user_a = me then clock_timestamp() else last_read_a end,
      last_read_b = case when user_b = me then clock_timestamp() else last_read_b end
  where id = p_conversation_id and (user_a = me or user_b = me);
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Lists the caller's conversations with the other participant's display info
-- and last message preview in one round trip. SECURITY DEFINER so a partner's
-- name/avatar is visible here even if they've hidden their directory listing
-- (a conversation partner is not the same as an anonymous directory browser);
-- the `where` clause below is hard-coded to auth.uid() so it can never expose
-- another user's conversations.
create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_display_name text,
  other_avatar_url text,
  last_message_body text,
  last_message_created_at timestamptz,
  last_message_sender_id uuid,
  my_last_read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    other.id,
    p.display_name,
    p.avatar_url,
    m.content,
    m.created_at,
    m.sender_id,
    case when c.user_a = auth.uid() then c.last_read_a else c.last_read_b end
  from public.conversations c
  cross join lateral (
    select case when c.user_a = auth.uid() then c.user_b else c.user_a end as id
  ) other
  left join public.profiles p on p.id = other.id
  left join lateral (
    select msg.content, msg.created_at, msg.sender_id
    from public.messages msg
    where msg.conversation_id = c.id
    order by msg.created_at desc
    limit 1
  ) m on true
  where c.user_a = auth.uid() or c.user_b = auth.uid()
  order by coalesce(m.created_at, c.created_at) desc;
$$;

revoke all on function public.list_my_conversations() from public, anon, authenticated;
grant execute on function public.list_my_conversations() to authenticated;
