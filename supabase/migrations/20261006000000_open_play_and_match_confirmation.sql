-- Two features that connect the app's existing pieces together:
--
--   1. Open play: a player posts a game at a court ("Doubles, Sat 4 PM,
--      need 3 more") and others join until it's full. Joining/leaving go
--      through SECURITY DEFINER functions so the capacity check and the
--      insert happen atomically (row lock), and so the host/players can be
--      notified (notifications_insert is admin-only).
--
--   2. Match confirmation: a recorded match can tag a registered opponent.
--      The opponent confirms or disputes the score; confirming locks the
--      score and adds the mirrored result to the opponent's own history.
--      Players can never mark their own match as confirmed.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reservation', 'game_invitation', 'community', 'system', 'message', 'connection', 'open_play', 'match'));

-- ---------------------------------------------------------------------------
-- 1. Open play
-- ---------------------------------------------------------------------------

create table if not exists public.open_games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  starts_at timestamptz not null,
  format text not null default 'Doubles' check (format in ('Singles', 'Doubles')),
  skill_min numeric(2,1) check (skill_min between 1.0 and 5.0),
  skill_max numeric(2,1) check (skill_max between 1.0 and 5.0),
  note text check (note is null or char_length(note) <= 280),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint open_games_skill_range check (skill_min is null or skill_max is null or skill_min <= skill_max)
);

create index if not exists open_games_upcoming_idx on public.open_games (starts_at) where status = 'open';
create index if not exists open_games_host_idx on public.open_games (host_id);

create table if not exists public.open_game_players (
  game_id uuid not null references public.open_games(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index if not exists open_game_players_player_idx on public.open_game_players (player_id);

create or replace function public.open_game_capacity(p_format text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_format = 'Singles' then 2 else 4 end;
$$;

grant execute on function public.open_game_capacity(text) to authenticated;

alter table public.open_games enable row level security;
alter table public.open_game_players enable row level security;
revoke all on table public.open_games, public.open_game_players from anon, authenticated;

-- Hosts create/edit/cancel/delete their own games; roster rows are only
-- written by the functions below, so players get SELECT only.
grant select, insert, update, delete on table public.open_games to authenticated;
grant select on table public.open_game_players to authenticated;

drop policy if exists open_games_select on public.open_games;
create policy open_games_select on public.open_games for select to authenticated using (true);

drop policy if exists open_games_insert on public.open_games;
create policy open_games_insert on public.open_games for insert to authenticated
  with check (host_id = (select auth.uid()) and status = 'open' and starts_at > now());

drop policy if exists open_games_update on public.open_games;
create policy open_games_update on public.open_games for update to authenticated
  using (host_id = (select auth.uid()) or (select private.is_admin()))
  with check (host_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists open_games_delete on public.open_games;
create policy open_games_delete on public.open_games for delete to authenticated
  using (host_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists open_game_players_select on public.open_game_players;
create policy open_game_players_select on public.open_game_players for select to authenticated using (true);

-- Hosts can't hand a game to someone else, re-open a cancelled game, or
-- shrink it below the number of players who already joined.
create or replace function private.guard_open_game_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.host_id is distinct from old.host_id then
    raise exception 'The host of a game cannot be changed' using errcode = '42501';
  end if;
  if old.status = 'cancelled' and new.status = 'open' then
    raise exception 'A cancelled game cannot be reopened. Host a new one instead.' using errcode = '22023';
  end if;
  if new.format is distinct from old.format
     and (select count(*) from public.open_game_players where game_id = new.id) > public.open_game_capacity(new.format) then
    raise exception 'Too many players have joined to switch to %', new.format using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists open_games_guard_update on public.open_games;
create trigger open_games_guard_update
  before update on public.open_games
  for each row execute function private.guard_open_game_update();

-- The host is always the first player on the roster.
create or replace function private.add_open_game_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.open_game_players (game_id, player_id) values (new.id, new.host_id)
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.add_open_game_host() from public, anon, authenticated;
drop trigger if exists open_games_add_host on public.open_games;
create trigger open_games_add_host
  after insert on public.open_games
  for each row execute function private.add_open_game_host();

create or replace function private.open_game_label(p_game_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.name || ' · ' || to_char(g.starts_at at time zone 'Asia/Manila', 'Dy Mon DD, FMHH12:MI AM')
  from public.open_games g join public.courts c on c.id = g.court_id
  where g.id = p_game_id;
$$;

revoke all on function private.open_game_label(uuid) from public, anon, authenticated;

-- Tell everyone on the roster when the host cancels.
create or replace function private.notify_open_game_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_name text;
begin
  if old.status = 'open' and new.status = 'cancelled' then
    select display_name into host_name from public.profiles where id = new.host_id;
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    select p.player_id, 'open_play', coalesce(host_name, 'The host') || ' cancelled an open game',
           private.open_game_label(new.id), new.id, new.host_id
    from public.open_game_players p
    where p.game_id = new.id and p.player_id <> new.host_id;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_open_game_cancelled() from public, anon, authenticated;
drop trigger if exists open_games_notify_cancelled on public.open_games;
create trigger open_games_notify_cancelled
  after update on public.open_games
  for each row execute function private.notify_open_game_cancelled();

-- Joins the caller to a game. Locks the game row so two players racing for
-- the last spot can't both get in. Returns the new roster size.
create or replace function public.join_open_game(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  game public.open_games;
  roster integer;
  capacity integer;
  my_name text;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into game from public.open_games where id = p_game_id for update;
  if game.id is null then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if game.status <> 'open' then
    raise exception 'This game was cancelled' using errcode = '22023';
  end if;
  if game.starts_at <= now() then
    raise exception 'This game has already started' using errcode = '22023';
  end if;

  select count(*) into roster from public.open_game_players where game_id = p_game_id;
  if exists (select 1 from public.open_game_players where game_id = p_game_id and player_id = me) then
    return roster;
  end if;

  capacity := public.open_game_capacity(game.format);
  if roster >= capacity then
    raise exception 'This game is already full' using errcode = '22023';
  end if;

  insert into public.open_game_players (game_id, player_id) values (p_game_id, me);
  roster := roster + 1;

  select display_name into my_name from public.profiles where id = me;
  if roster = capacity then
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    select p.player_id, 'open_play', 'Your open game is full — see you on court!',
           private.open_game_label(p_game_id), p_game_id, me
    from public.open_game_players p
    where p.game_id = p_game_id and p.player_id <> me;
  else
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    values (game.host_id, 'open_play', coalesce(my_name, 'A player') || ' joined your open game',
            private.open_game_label(p_game_id) || ' · ' || roster || '/' || capacity || ' players', p_game_id, me);
  end if;

  return roster;
end;
$$;

revoke all on function public.join_open_game(uuid) from public, anon, authenticated;
grant execute on function public.join_open_game(uuid) to authenticated;

create or replace function public.leave_open_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  game public.open_games;
  my_name text;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into game from public.open_games where id = p_game_id;
  if game.id is null then
    raise exception 'Game not found' using errcode = 'P0002';
  end if;
  if game.host_id = me then
    raise exception 'Hosts cancel the game instead of leaving it' using errcode = '22023';
  end if;

  delete from public.open_game_players where game_id = p_game_id and player_id = me;
  if found and game.status = 'open' and game.starts_at > now() then
    select display_name into my_name from public.profiles where id = me;
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    values (game.host_id, 'open_play', coalesce(my_name, 'A player') || ' left your open game',
            private.open_game_label(p_game_id), p_game_id, me);
  end if;
end;
$$;

revoke all on function public.leave_open_game(uuid) from public, anon, authenticated;
grant execute on function public.leave_open_game(uuid) to authenticated;

-- Upcoming open games with court and roster details in one round trip.
-- SECURITY DEFINER so roster names show even for players hidden from the
-- directory: joining a public game shares your name with that game, the same
-- reasoning list_my_conversations uses for chat partners.
create or replace function public.list_open_games()
returns table (
  game_id uuid,
  host_id uuid,
  host_name text,
  court_id uuid,
  court_name text,
  court_area text,
  starts_at timestamptz,
  format text,
  capacity integer,
  skill_min numeric,
  skill_max numeric,
  note text,
  players jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.host_id, hp.display_name, g.court_id, c.name, c.area, g.starts_at, g.format,
    public.open_game_capacity(g.format), g.skill_min, g.skill_max, g.note,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', p.player_id, 'name', pr.display_name, 'avatar_url', pr.avatar_url) order by p.joined_at)
      from public.open_game_players p
      left join public.profiles pr on pr.id = p.player_id
      where p.game_id = g.id
    ), '[]'::jsonb)
  from public.open_games g
  join public.courts c on c.id = g.court_id
  left join public.profiles hp on hp.id = g.host_id
  where auth.uid() is not null and g.status = 'open' and g.starts_at > now()
  order by g.starts_at
  limit 100;
$$;

revoke all on function public.list_open_games() from public, anon, authenticated;
grant execute on function public.list_open_games() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Match confirmation
-- ---------------------------------------------------------------------------

alter table public.game_records
  add column if not exists opponent_id uuid references auth.users(id) on delete set null,
  add column if not exists confirmation_status text not null default 'unverified'
    check (confirmation_status in ('unverified', 'pending', 'confirmed', 'disputed')),
  add column if not exists source_record_id uuid references public.game_records(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'game_records_opponent_not_self') then
    alter table public.game_records add constraint game_records_opponent_not_self
      check (opponent_id is null or opponent_id <> player_id);
  end if;
end;
$$;

create unique index if not exists game_records_source_record_idx
  on public.game_records (source_record_id) where source_record_id is not null;
create index if not exists game_records_opponent_pending_idx
  on public.game_records (opponent_id) where confirmation_status = 'pending';

-- A tagged opponent can read the record they're asked to confirm.
drop policy if exists game_records_select on public.game_records;
create policy game_records_select on public.game_records for select to authenticated
  using (player_id = (select auth.uid()) or opponent_id = (select auth.uid()) or (select private.is_admin()));

-- Players never set confirmation state themselves: tagging an opponent makes
-- the record 'pending', and changing the score/date/opponent of a pending or
-- disputed record re-sends it. Confirmed scores are locked. Only the client
-- API roles are restricted, so respond_match_confirmation (running as the
-- function owner) and admins can still write these columns.
create or replace function private.guard_game_record_confirmation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  match_changed boolean;
begin
  if current_user not in ('authenticated', 'anon') or private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.source_record_id := null;
    new.confirmation_status := case when new.opponent_id is null then 'unverified' else 'pending' end;
    return new;
  end if;

  match_changed := (new.player_score, new.opponent_score, new.played_on, new.opponent_id)
    is distinct from (old.player_score, old.opponent_score, old.played_on, old.opponent_id);

  if old.confirmation_status = 'confirmed' and match_changed then
    raise exception 'Confirmed matches are locked. Delete it and record it again if it was wrong.'
      using errcode = '42501';
  end if;

  new.source_record_id := old.source_record_id;
  new.confirmation_status := case
    when not match_changed then old.confirmation_status
    when new.opponent_id is null then 'unverified'
    else 'pending'
  end;
  return new;
end;
$$;

drop trigger if exists game_records_guard_confirmation on public.game_records;
create trigger game_records_guard_confirmation
  before insert or update on public.game_records
  for each row execute function private.guard_game_record_confirmation();

create or replace function private.notify_match_confirmation_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_name text;
begin
  if new.confirmation_status <> 'pending' or new.opponent_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.confirmation_status = 'pending'
     and (new.player_score, new.opponent_score, new.played_on, new.opponent_id)
         is not distinct from (old.player_score, old.opponent_score, old.played_on, old.opponent_id) then
    return new;
  end if;

  select display_name into reporter_name from public.profiles where id = new.player_id;
  insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
  values (
    new.opponent_id, 'match',
    coalesce(reporter_name, 'A player') || ' recorded a match with you',
    'Confirm the score: ' || coalesce(reporter_name, 'them') || ' ' || new.player_score || ' – you ' || new.opponent_score,
    new.id, new.player_id
  );
  return new;
end;
$$;

revoke all on function private.notify_match_confirmation_request() from public, anon, authenticated;
drop trigger if exists game_records_notify_confirmation on public.game_records;
create trigger game_records_notify_confirmation
  after insert or update on public.game_records
  for each row execute function private.notify_match_confirmation_request();

-- Matches waiting for the caller to confirm, with the reporter's name.
create or replace function public.list_pending_match_confirmations()
returns table (
  record_id uuid,
  reporter_id uuid,
  reporter_name text,
  reporter_avatar_url text,
  played_on date,
  reporter_score smallint,
  my_score smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.player_id, p.display_name, p.avatar_url, r.played_on, r.player_score, r.opponent_score
  from public.game_records r
  left join public.profiles p on p.id = r.player_id
  where r.opponent_id = auth.uid() and r.confirmation_status = 'pending'
  order by r.played_on desc, r.created_at desc;
$$;

revoke all on function public.list_pending_match_confirmations() from public, anon, authenticated;
grant execute on function public.list_pending_match_confirmations() to authenticated;

-- The tagged opponent confirms (locks the score and adds the mirrored result
-- to their own history) or disputes (the reporter can correct and re-send).
create or replace function public.respond_match_confirmation(p_record_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec public.game_records;
  my_name text;
  reporter_name text;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into rec from public.game_records where id = p_record_id for update;
  if rec.id is null or rec.opponent_id is distinct from me then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  if rec.confirmation_status <> 'pending' then
    raise exception 'This match is no longer waiting for confirmation' using errcode = '22023';
  end if;

  select display_name into my_name from public.profiles where id = me;
  select display_name into reporter_name from public.profiles where id = rec.player_id;

  if p_confirm then
    update public.game_records set confirmation_status = 'confirmed' where id = rec.id;

    if not exists (select 1 from public.game_records where source_record_id = rec.id) then
      insert into public.game_records
        (player_id, played_on, opponents, player_score, opponent_score, opponent_id, confirmation_status, source_record_id)
      values
        (me, rec.played_on, left(coalesce(nullif(trim(reporter_name), ''), 'Opponent'), 240),
         rec.opponent_score, rec.player_score, rec.player_id, 'confirmed', rec.id);
    end if;

    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    values (rec.player_id, 'match', coalesce(my_name, 'Your opponent') || ' confirmed your match',
            'Verified score: ' || rec.player_score || '–' || rec.opponent_score, rec.id, me);
  else
    update public.game_records set confirmation_status = 'disputed' where id = rec.id;
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    values (rec.player_id, 'match', coalesce(my_name, 'Your opponent') || ' disputed your match score',
            'Edit the score in History to send it again.', rec.id, me);
  end if;
end;
$$;

revoke all on function public.respond_match_confirmation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_match_confirmation(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live rosters and live confirmation status.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['open_games', 'open_game_players', 'game_records'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
