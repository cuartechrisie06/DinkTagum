-- Community safety and post types. Additive only: new tables and columns
-- with defaults; existing rows and columns are untouched.
--
--   1. community_post_reports: one report per (post, reporter) with a reason.
--      report_community_post(post, reason, details) records it and flags the
--      post for admin review (the old one-argument version keeps working).
--   2. user_blocks: a player hides another player's posts and comments
--      (filtered in the app; blocking is private to the blocker).
--   3. Posting rate limit: at most 3 posts per player per minute (admins
--      exempt). Mirrors POST_RATE_LIMIT in src/utils/community.js.
--   4. community_posts.post_type ('text' | 'photo' | 'checkin' | 'match') and
--      match_record_id (the shared match, for match-result posts).
-- Admin delete needs nothing new: community_posts_delete already allows admins.

-- 1. Reports -----------------------------------------------------------------
create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'inappropriate', 'misinformation', 'other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index if not exists community_post_reports_reporter_idx on public.community_post_reports (reporter_id);

alter table public.community_post_reports enable row level security;
revoke all on table public.community_post_reports from anon;
grant select on table public.community_post_reports to authenticated;

-- Reporters see their own reports (to hide those posts); admins see all.
-- Writes go through report_community_post only.
drop policy if exists community_post_reports_select on public.community_post_reports;
create policy community_post_reports_select on public.community_post_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select private.is_admin()));

create or replace function public.report_community_post(p_post_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  post_author uuid;
begin
  if me is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'inappropriate', 'misinformation', 'other') then
    raise exception 'Choose a reason for the report' using errcode = '22023';
  end if;

  select author_id into post_author from public.community_posts where id = p_post_id;
  if post_author is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if post_author = me then
    raise exception 'You cannot report your own post' using errcode = '22023';
  end if;

  insert into public.community_post_reports (post_id, reporter_id, reason, details)
  values (p_post_id, me, p_reason, nullif(left(trim(coalesce(p_details, '')), 500), ''))
  on conflict (post_id, reporter_id) do update set reason = excluded.reason, details = excluded.details;

  update public.community_posts set is_reported = true where id = p_post_id and not is_reported;
end;
$$;

revoke all on function public.report_community_post(uuid, text, text) from public, anon, authenticated;
grant execute on function public.report_community_post(uuid, text, text) to authenticated;

-- 2. Blocks ------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_distinct_users check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;
revoke all on table public.user_blocks from anon;
grant select, insert, delete on table public.user_blocks to authenticated;

drop policy if exists user_blocks_select on public.user_blocks;
create policy user_blocks_select on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
drop policy if exists user_blocks_insert on public.user_blocks;
create policy user_blocks_insert on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- 3. Rate limit --------------------------------------------------------------
create or replace function private.community_posts_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  if (select auth.uid()) is null or (select private.is_admin()) then
    return new;
  end if;
  select count(*) into recent
    from public.community_posts
   where author_id = new.author_id
     and created_at > now() - interval '1 minute';
  if recent >= 3 then
    raise exception 'You are posting too fast. Wait a minute and try again.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.community_posts_rate_limit() from public, anon, authenticated;
create index if not exists community_posts_author_created_idx on public.community_posts (author_id, created_at desc);
drop trigger if exists community_posts_rate_limit on public.community_posts;
create trigger community_posts_rate_limit
  before insert on public.community_posts
  for each row execute function private.community_posts_rate_limit();

-- 4. Post types ----------------------------------------------------------------
alter table public.community_posts
  add column if not exists post_type text not null default 'text'
    check (post_type in ('text', 'photo', 'checkin', 'match')),
  add column if not exists match_record_id uuid references public.game_records(id) on delete set null;

-- A match post may only share the author's own match record.
create or replace function private.guard_community_post_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.match_record_id is not null and not exists (
    select 1 from public.game_records g where g.id = new.match_record_id and g.player_id = new.author_id
  ) then
    raise exception 'You can only share your own matches' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_community_post_match() from public, anon, authenticated;
drop trigger if exists community_posts_guard_match on public.community_posts;
create trigger community_posts_guard_match
  before insert or update of match_record_id on public.community_posts
  for each row execute function private.guard_community_post_match();
