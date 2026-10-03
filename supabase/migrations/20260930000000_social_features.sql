-- Adds three previously-missing pieces of the social graph:
--   1. player_connections: a real "Connect" between two players (the
--      directory's Connect button previously only flipped local component
--      state and wrote nothing to the database).
--   2. community_post_likes / community_post_comments: reactions on feed
--      posts, which the schema had no room for at all.
--   3. invite_player_to_game: lets a player actually send a 'game_invitation'
--      notification, the only notifications.kind value nothing ever created.
--
-- All three follow the same patterns already established by conversations/
-- messages and reservations/notifications: RLS restricts direct writes,
-- SECURITY DEFINER functions handle anything that needs to be atomic or
-- needs to write a notification on someone else's behalf.

-- ---------------------------------------------------------------------------
-- 1. Player connections
-- ---------------------------------------------------------------------------

create table if not exists public.player_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint player_connections_distinct_users check (requester_id <> recipient_id)
);

create unique index if not exists player_connections_pair_idx
  on public.player_connections (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index if not exists player_connections_recipient_idx on public.player_connections (recipient_id);
create index if not exists player_connections_requester_idx on public.player_connections (requester_id);

alter table public.player_connections enable row level security;
revoke all on table public.player_connections from anon, authenticated;

-- Only SELECT/DELETE are granted directly: rows are only ever created (or
-- accepted) through request_player_connection below, which needs to
-- atomically check both directions of the pair before deciding whether to
-- insert a new pending request or accept an existing one.
grant select, delete on table public.player_connections to authenticated;

drop policy if exists player_connections_select on public.player_connections;
create policy player_connections_select on public.player_connections for select to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

drop policy if exists player_connections_delete on public.player_connections;
create policy player_connections_delete on public.player_connections for delete to authenticated
  using (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()));

-- notifications.kind previously had no value for this; 'connection' is added
-- below alongside the other kinds this migration starts using.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reservation', 'game_invitation', 'community', 'system', 'message', 'connection'));

-- Sends a connection request, or — if the other player already has a pending
-- request out to us — accepts it instead, so a mutual "Connect" tap on both
-- sides always resolves to one accepted connection rather than two pending
-- rows pointed at each other. Idempotent: calling it again after either
-- state just returns the existing row.
create or replace function public.request_player_connection(other_user_id uuid)
returns public.player_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing public.player_connections;
  result public.player_connections;
  requester_name text;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if other_user_id is null or other_user_id = me then
    raise exception 'Cannot connect with yourself' using errcode = '22023';
  end if;

  select * into existing from public.player_connections
  where (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
      = (least(me, other_user_id), greatest(me, other_user_id));

  if existing.id is not null then
    if existing.status = 'pending' and existing.requester_id = other_user_id then
      update public.player_connections set status = 'accepted', responded_at = clock_timestamp()
      where id = existing.id
      returning * into result;

      select display_name into requester_name from public.profiles where id = me;
      insert into public.notifications (recipient_id, kind, title, body, related_id)
      values (other_user_id, 'connection', coalesce(requester_name, 'A player') || ' accepted your connection request', null, result.id);

      return result;
    end if;
    return existing;
  end if;

  insert into public.player_connections (requester_id, recipient_id)
  values (me, other_user_id)
  returning * into result;

  select display_name into requester_name from public.profiles where id = me;
  insert into public.notifications (recipient_id, kind, title, body, related_id)
  values (other_user_id, 'connection', coalesce(requester_name, 'A player') || ' wants to connect', null, result.id);

  return result;
end;
$$;

revoke all on function public.request_player_connection(uuid) from public, anon, authenticated;
grant execute on function public.request_player_connection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Community post likes + comments
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.community_post_likes enable row level security;
revoke all on table public.community_post_likes from anon, authenticated;
grant select, insert, delete on table public.community_post_likes to authenticated;

-- Visibility mirrors community_posts_select: a reported post's likes are
-- only visible to its author and admins, same as the post itself.
drop policy if exists community_post_likes_select on public.community_post_likes;
create policy community_post_likes_select on public.community_post_likes for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id and (not p.is_reported or p.author_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

drop policy if exists community_post_likes_insert on public.community_post_likes;
create policy community_post_likes_insert on public.community_post_likes for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists community_post_likes_delete on public.community_post_likes;
create policy community_post_likes_delete on public.community_post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_post_idx on public.community_post_comments (post_id, created_at);

alter table public.community_post_comments enable row level security;
revoke all on table public.community_post_comments from anon, authenticated;
grant select, insert, delete on table public.community_post_comments to authenticated;

drop policy if exists community_post_comments_select on public.community_post_comments;
create policy community_post_comments_select on public.community_post_comments for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id and (not p.is_reported or p.author_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

drop policy if exists community_post_comments_insert on public.community_post_comments;
create policy community_post_comments_insert on public.community_post_comments for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists community_post_comments_delete on public.community_post_comments;
create policy community_post_comments_delete on public.community_post_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_post_likes'
  ) then
    alter publication supabase_realtime add table public.community_post_likes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_post_comments'
  ) then
    alter publication supabase_realtime add table public.community_post_comments;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Game invitations
-- ---------------------------------------------------------------------------

-- notifications_insert is restricted to admins only, so a player inviting
-- another player to play needs a SECURITY DEFINER path, the same way
-- messages/reservations notify their recipient today.
create or replace function public.invite_player_to_game(p_recipient_id uuid, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sender_name text;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_recipient_id is null or p_recipient_id = me then
    raise exception 'Cannot invite yourself' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_recipient_id) then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;

  select display_name into sender_name from public.profiles where id = me;

  insert into public.notifications (recipient_id, kind, title, body)
  values (
    p_recipient_id,
    'game_invitation',
    coalesce(sender_name, 'A player') || ' invited you to play',
    nullif(trim(coalesce(p_message, '')), '')
  );
end;
$$;

revoke all on function public.invite_player_to_game(uuid, text) from public, anon, authenticated;
grant execute on function public.invite_player_to_game(uuid, text) to authenticated;
