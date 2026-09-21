-- RLS and grant baseline for all client-facing DinkTagum tables.
-- Admin is determined only from auth.jwt() app_metadata.role = 'admin'.

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function private.is_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.courts enable row level security;
alter table public.reservations enable row level security;
alter table public.game_records enable row level security;
alter table public.community_posts enable row level security;
alter table public.notifications enable row level security;

-- Anonymous visitors have no API access. Authenticated is intentionally granted
-- each verb because administrators share that database role; RLS decides rows.
revoke all on table public.profiles, public.courts, public.reservations,
  public.game_records, public.community_posts, public.notifications
  from anon, authenticated;

grant select, insert, update, delete on table public.profiles, public.courts,
  public.reservations, public.game_records, public.community_posts,
  public.notifications to authenticated;

-- Reservation-created notifications are internal writes. Running this trigger
-- as its owner avoids granting every player notification INSERT permission.
create or replace function private.create_reservation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, kind, title, body)
  values (new.user_id, 'reservation', 'Reservation received', 'Your court reservation is pending confirmation.');
  return new;
end;
$$;

revoke all on function private.create_reservation_notification() from public, anon, authenticated;
drop trigger if exists reservations_create_notification on public.reservations;
drop function if exists public.create_reservation_notification();
create trigger reservations_create_notification
  after insert on public.reservations
  for each row execute function private.create_reservation_notification();

-- Replace every existing policy on the six application tables. Doing this as a
-- set makes this migration safe with the earlier setup SQL files.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select ns.nspname, cls.relname, pol.polname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname in ('profiles', 'courts', 'reservations', 'game_records', 'community_posts', 'notifications')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.polname, policy_record.nspname, policy_record.relname);
  end loop;
end;
$$;

-- Profiles: visible directory entries, self-service profile editing, admin CRUD.
create policy profiles_select on public.profiles for select to authenticated
  using (is_directory_visible or id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select private.is_admin()));

-- Courts: every signed-in player can browse; only admins manage venues.
create policy courts_select on public.courts for select to authenticated using (true);
create policy courts_insert on public.courts for insert to authenticated
  with check ((select private.is_admin()));
create policy courts_update on public.courts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy courts_delete on public.courts for delete to authenticated
  using ((select private.is_admin()));

-- Reservations: players manage only their own reservations; admins manage all.
create policy reservations_select on public.reservations for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy reservations_insert on public.reservations for insert to authenticated
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy reservations_update on public.reservations for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy reservations_delete on public.reservations for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- Game records: private to the player, with full administrator moderation.
create policy game_records_select on public.game_records for select to authenticated
  using (player_id = (select auth.uid()) or (select private.is_admin()));
create policy game_records_insert on public.game_records for insert to authenticated
  with check (player_id = (select auth.uid()) or (select private.is_admin()));
create policy game_records_update on public.game_records for update to authenticated
  using (player_id = (select auth.uid()) or (select private.is_admin()))
  with check (player_id = (select auth.uid()) or (select private.is_admin()));
create policy game_records_delete on public.game_records for delete to authenticated
  using (player_id = (select auth.uid()) or (select private.is_admin()));

-- Community posts: all signed-in players can read non-reported posts; authors
-- manage their own posts and administrators can moderate every post.
create policy community_posts_select on public.community_posts for select to authenticated
  using (not is_reported or author_id = (select auth.uid()) or (select private.is_admin()));
create policy community_posts_insert on public.community_posts for insert to authenticated
  with check ((author_id = (select auth.uid()) and not is_reported) or (select private.is_admin()));
create policy community_posts_update on public.community_posts for update to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()))
  with check (author_id = (select auth.uid()) or (select private.is_admin()));
create policy community_posts_delete on public.community_posts for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

-- Notifications: players can only see and update their own; admins can create,
-- update, or remove any notification for support and reservation workflows.
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) or (select private.is_admin()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check ((select private.is_admin()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) or (select private.is_admin()))
  with check (recipient_id = (select auth.uid()) or (select private.is_admin()));
create policy notifications_delete on public.notifications for delete to authenticated
  using ((select private.is_admin()));
