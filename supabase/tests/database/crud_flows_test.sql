-- Run with: supabase test db
-- Covers the player-facing update/delete paths the app uses, plus reporting.

begin;
select plan(16);

select tests.create_supabase_user('crud-one@test.local');
select tests.create_supabase_user('crud-two@test.local');

insert into public.profiles (id, display_name)
values
  (tests.get_supabase_uid('crud-one@test.local'), 'Crud One'),
  (tests.get_supabase_uid('crud-two@test.local'), 'Crud Two')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.courts (name, status, court_count) values ('CRUD Test Court', 'Available', 1);

insert into public.community_posts (author_id, body)
values
  (tests.get_supabase_uid('crud-one@test.local'), 'Crud one post'),
  (tests.get_supabase_uid('crud-two@test.local'), 'Crud two post');

insert into public.game_records (player_id, opponents, player_score, opponent_score)
values
  (tests.get_supabase_uid('crud-one@test.local'), 'Rival', 11, 4),
  (tests.get_supabase_uid('crud-two@test.local'), 'Other', 11, 2);

insert into public.reservations (user_id, court_id, start_time, end_time)
select tests.get_supabase_uid('crud-one@test.local'), id, now() + interval '5 days', now() + interval '5 days 1 hour'
from public.courts where name = 'CRUD Test Court';

select tests.authenticate_as('crud-one@test.local');

-- Game records: update + delete own, never someone else's.
select lives_ok($$update public.game_records set player_score = 11, opponent_score = 9 where opponents = 'Rival'$$, 'player can update own game record');
select is((select opponent_score::int from public.game_records where opponents = 'Rival'), 9, 'game record update is persisted');
update public.game_records set opponents = 'Hacked' where opponents = 'Other';
delete from public.game_records where opponents = 'Other';
select tests.authenticate_as('crud-two@test.local');
select is((select opponents from public.game_records where player_id = auth.uid()), 'Other', 'player cannot update or delete another player game record');
select tests.authenticate_as('crud-one@test.local');
select lives_ok($$delete from public.game_records where opponents = 'Rival'$$, 'player can delete own game record');
select is((select count(*) from public.game_records), 0::bigint, 'deleted game record is gone');

-- Reservations: cancel frees the slot, then the record can be removed.
select lives_ok($$update public.reservations set status = 'cancelled' where user_id = auth.uid()$$, 'player can cancel own reservation');
select lives_ok(
  $$insert into public.reservations (user_id, court_id, start_time, end_time)
    select auth.uid(), id, now() + interval '5 days', now() + interval '5 days 1 hour'
    from public.courts where name = 'CRUD Test Court'$$,
  'a cancelled reservation no longer blocks its slot'
);
select lives_ok($$delete from public.reservations where user_id = auth.uid() and status = 'cancelled'$$, 'player can delete own cancelled reservation');
select is((select count(*) from public.reservations), 1::bigint, 'only the new reservation remains');

-- Community posts: edit/delete own, report others via RPC only.
select lives_ok($$update public.community_posts set body = 'Edited' where body = 'Crud one post'$$, 'author can edit own post');
select throws_ok(
  $$select public.report_community_post((select id from public.community_posts where body = 'Edited'))$$,
  '22023', 'You cannot report your own post', 'player cannot report own post'
);
select lives_ok(
  $$select public.report_community_post((select id from public.community_posts where body = 'Crud two post'))$$,
  'player can report another player post'
);
select is((select count(*) from public.community_posts where body = 'Crud two post'), 0::bigint, 'reported post is hidden from the reporter');
select throws_ok(
  $$update public.community_posts set is_reported = true where body = 'Edited'$$,
  '42501', 'Only administrators can change is_reported', 'direct is_reported updates are still blocked for players'
);
select lives_ok($$delete from public.community_posts where body = 'Edited'$$, 'author can delete own post');

select tests.authenticate_as('crud-two@test.local');
select is((select is_reported from public.community_posts where body = 'Crud two post'), true, 'author still sees own reported post, flagged');

select * from finish();
rollback;
