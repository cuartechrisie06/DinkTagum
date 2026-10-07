-- Social polish:
--   1. profiles.availability: when a player usually plays, for the Find
--      Players filter (edited on the Profile screen).
--   2. community_posts.court_id: optional court tag on a post.
--   3. conversations in Realtime, so "Seen" under a chat message updates live
--      when the other person opens the chat (mark_conversation_read updates
--      last_read_a / last_read_b). RLS already limits rows to participants.

alter table public.profiles
  add column if not exists availability text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_availability_values') then
    alter table public.profiles add constraint profiles_availability_values
      check (availability <@ array['Weekday mornings', 'Weekday evenings', 'Weekends']::text[]);
  end if;
end;
$$;

alter table public.community_posts
  add column if not exists court_id uuid references public.courts(id) on delete set null;

create index if not exists community_posts_court_idx on public.community_posts (court_id) where court_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
