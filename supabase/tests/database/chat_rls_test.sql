-- Run with: supabase test db
-- Requires 000-setup-tests-hooks.sql in this directory.

begin;
select plan(13);

select tests.create_supabase_user('chat-player-one@test.local');
select tests.create_supabase_user('chat-player-two@test.local');
select tests.create_supabase_user('chat-player-three@test.local');

insert into public.profiles (id, display_name)
values
  (tests.get_supabase_uid('chat-player-one@test.local'), 'Chat Player One'),
  (tests.get_supabase_uid('chat-player-two@test.local'), 'Chat Player Two'),
  (tests.get_supabase_uid('chat-player-three@test.local'), 'Chat Player Three')
on conflict (id) do update set display_name = excluded.display_name;

select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'conversations has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'messages has RLS enabled');

select tests.authenticate_as('chat-player-one@test.local');

select throws_ok(
  $$select public.find_or_create_direct_conversation(auth.uid())$$,
  '22023',
  'Cannot start a conversation with yourself',
  'a player cannot start a conversation with themselves'
);

select is(
  (select public.find_or_create_direct_conversation((select tests.get_supabase_uid('chat-player-two@test.local')))),
  (select public.find_or_create_direct_conversation((select tests.get_supabase_uid('chat-player-two@test.local')))),
  'calling find_or_create_direct_conversation twice returns the same conversation id'
);

-- Stash the conversation id in a session GUC so later assertions (including
-- ones made while authenticated as an unrelated user, who cannot SELECT this
-- row at all) can reference it without depending on RLS-filtered lookups.
select set_config(
  'app.test_convo_id',
  (select public.find_or_create_direct_conversation((select tests.get_supabase_uid('chat-player-two@test.local'))))::text,
  true
);

select lives_ok(
  $$insert into public.messages (conversation_id, sender_id, content)
    values (current_setting('app.test_convo_id')::uuid, auth.uid(), 'Hello from player one')$$,
  'a participant can send a message as themselves'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, content)
    values (current_setting('app.test_convo_id')::uuid,
            (select tests.get_supabase_uid('chat-player-two@test.local')), 'Impersonation attempt')$$,
  '42501',
  'a player cannot send a message as another user'
);

select tests.authenticate_as('chat-player-three@test.local');

select is(
  (select count(*)::int from public.conversations where id = current_setting('app.test_convo_id')::uuid),
  0,
  'an unrelated player cannot read a conversation they are not part of'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, content)
    values (current_setting('app.test_convo_id')::uuid, auth.uid(), 'Should be rejected')$$,
  '42501',
  'an unrelated player cannot send a message into a conversation they are not part of'
);

select lives_ok(
  $$select public.mark_conversation_read(current_setting('app.test_convo_id')::uuid)$$,
  'mark_conversation_read does not error for a conversation the caller is not part of (it is simply a no-op)'
);

select tests.authenticate_as('chat-player-two@test.local');

select is(
  (select count(*)::int from public.messages where conversation_id = current_setting('app.test_convo_id')::uuid),
  1,
  'the other participant can read the message sent to them'
);

select is(
  (select other_display_name from public.list_my_conversations() where conversation_id = current_setting('app.test_convo_id')::uuid),
  'Chat Player One',
  'list_my_conversations resolves the other participant''s display name'
);

select lives_ok(
  $$select public.mark_conversation_read(current_setting('app.test_convo_id')::uuid)$$,
  'a participant can mark their own side of the conversation read'
);

select isnt(
  (select last_read_a from public.conversations where id = current_setting('app.test_convo_id')::uuid),
  (select last_read_b from public.conversations where id = current_setting('app.test_convo_id')::uuid),
  'mark_conversation_read only updates the caller''s own last-read column, not the other participant''s'
);

select * from finish();
rollback;
