-- Run with: supabase test db
-- Requires 000-setup-tests-hooks.sql in this directory. The CLI executes
-- database test files alphabetically, so pgTAP and `tests` helpers exist here.
-- Do not run this file through the hosted SQL Editor.

begin;
select plan(20);

select tests.create_supabase_user('player-one@test.local');
select tests.create_supabase_user('player-two@test.local');
select tests.create_supabase_user('admin@test.local');

insert into public.profiles (id, display_name, is_directory_visible)
values
  (tests.get_supabase_uid('player-one@test.local'), 'Player One', true),
  (tests.get_supabase_uid('player-two@test.local'), 'Player Two', false),
  (tests.get_supabase_uid('admin@test.local'), 'Admin', false)
on conflict (id) do update set is_directory_visible = excluded.is_directory_visible;

insert into public.courts (name, status, court_count)
values ('RLS Test Court', 'Available', 1);

insert into public.game_records (player_id, opponents, player_score, opponent_score)
values
  (tests.get_supabase_uid('player-one@test.local'), 'Player Two', 11, 8),
  (tests.get_supabase_uid('player-two@test.local'), 'Player One', 8, 11);

insert into public.community_posts (author_id, body)
values
  (tests.get_supabase_uid('player-one@test.local'), 'Player one post'),
  (tests.get_supabase_uid('player-two@test.local'), 'Reported post');
update public.community_posts set is_reported = true where body = 'Reported post';

insert into public.reservations (user_id, court_id, start_time, end_time)
select tests.get_supabase_uid('player-one@test.local'), id, now() + interval '1 day', now() + interval '1 day 1 hour'
from public.courts where name = 'RLS Test Court';
insert into public.reservations (user_id, court_id, start_time, end_time)
select tests.get_supabase_uid('player-two@test.local'), id, now() + interval '2 days', now() + interval '2 days 1 hour'
from public.courts where name = 'RLS Test Court';

insert into public.notifications (recipient_id, kind, title)
values
  (tests.get_supabase_uid('player-one@test.local'), 'system', 'Player one notice'),
  (tests.get_supabase_uid('player-two@test.local'), 'system', 'Player two notice');

select tests.authenticate_as('player-one@test.local');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.courts'::regclass), 'courts has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.reservations'::regclass), 'reservations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.game_records'::regclass), 'game_records has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.community_posts'::regclass), 'community_posts has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications has RLS enabled');
select is((select count(*) from public.game_records), 1::bigint, 'player reads only own games');
select is((select count(*) from public.reservations), 1::bigint, 'player reads only own reservations');
select is((select count(*) from public.notifications), 1::bigint, 'player reads only own notifications');
select is((select count(*) from public.profiles where display_name = 'Player Two'), 0::bigint, 'player cannot read hidden directory profile');
select is((select count(*) from public.community_posts), 1::bigint, 'player cannot read another author reported post');
select lives_ok(
  $$insert into public.reservations (user_id, court_id, start_time, end_time)
    select auth.uid(), id, now() + interval '3 days', now() + interval '3 days 1 hour'
    from public.courts where name = 'RLS Test Court'$$,
  'player can create an own reservation and its internal notification'
);
select throws_ok(
  $$insert into public.courts (name, status, court_count) values ('Unauthorized court', 'Available', 1)$$,
  '42501',
  'new row violates row-level security policy for table "courts"',
  'player cannot create courts'
);
select throws_ok(
  $$insert into public.game_records (player_id, opponents, player_score, opponent_score) values ((select tests.get_supabase_uid('player-two@test.local')), 'x', 11, 1)$$,
  '42501',
  'new row violates row-level security policy for table "game_records"',
  'player cannot create another player game record'
);
select throws_ok(
  $$update public.community_posts set is_reported = true where body = 'Player one post'$$,
  '42501',
  'Only administrators can change is_reported',
  'author cannot set is_reported on own post'
);

select tests.authenticate_as('player-two@test.local');
select throws_ok(
  $$update public.community_posts set is_reported = false where body = 'Reported post'$$,
  '42501',
  'Only administrators can change is_reported',
  'author cannot clear is_reported on own post'
);

select tests.authenticate_as('admin@test.local');
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', tests.get_supabase_uid('admin@test.local'),
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'admin')
  )::text,
  true
);
select is((select count(*) from public.game_records), 2::bigint, 'admin reads all game records');
select is((select count(*) from public.reservations), 3::bigint, 'admin reads all reservations');
select is((select count(*) from public.notifications), 3::bigint, 'admin reads all notifications');
select lives_ok(
  $$update public.courts set status = 'Closed' where name = 'RLS Test Court'$$,
  'admin can update courts'
);

select * from finish();
rollback;
