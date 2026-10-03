-- Feed activity previously created no notifications at all: the 'community'
-- kind existed (and the app already routes it to the Feed tab) but nothing
-- ever inserted one. This wires every feed action to a notification, using
-- the same SECURITY DEFINER trigger pattern as private.create_message_notification
-- since notifications_insert is restricted to admins.
--
--   like       -> post author                       ("X liked your post")
--   comment    -> post author + earlier commenters  ("X commented on your post")
--   new post   -> the author's accepted connections ("X shared a new post")
--   report     -> post author + every admin
--   admin restores / deletes a reported post -> post author
--
-- related_id always holds the post id. Nobody is ever notified about their
-- own action.

-- Who triggered the notification. Lets a like/unlike/like toggle be
-- deduplicated per liker instead of notifying the author every time.
alter table public.notifications
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

create or replace function private.post_excerpt(p_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(p_body) > 100 then left(p_body, 100) || '…' else p_body end;
$$;

revoke all on function private.post_excerpt(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------

create or replace function private.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  post_body text;
  liker_name text;
begin
  select author_id, body into post_author, post_body from public.community_posts where id = new.post_id;
  if post_author is null or post_author = new.user_id then
    return new;
  end if;

  -- Re-liking after an unlike shouldn't notify the author a second time.
  if exists (
    select 1 from public.notifications
    where recipient_id = post_author and kind = 'community'
      and related_id = new.post_id and actor_id = new.user_id
      and title like '% liked your post'
  ) then
    return new;
  end if;

  select display_name into liker_name from public.profiles where id = new.user_id;

  insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
  values (post_author, 'community', coalesce(liker_name, 'A player') || ' liked your post',
          private.post_excerpt(post_body), new.post_id, new.user_id);

  return new;
end;
$$;

revoke all on function private.notify_post_like() from public, anon, authenticated;
drop trigger if exists community_post_likes_notify on public.community_post_likes;
create trigger community_post_likes_notify
  after insert on public.community_post_likes
  for each row execute function private.notify_post_like();

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create or replace function private.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  commenter_name text;
  actor_name text;
begin
  select author_id into post_author from public.community_posts where id = new.post_id;
  if post_author is null then
    return new;
  end if;

  select display_name into commenter_name from public.profiles where id = new.author_id;
  actor_name := coalesce(commenter_name, 'A player');

  if post_author <> new.author_id then
    insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
    values (post_author, 'community', actor_name || ' commented on your post',
            private.post_excerpt(new.body), new.post_id, new.author_id);
  end if;

  -- Everyone else already in the thread, so replies don't go unseen.
  insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
  select distinct c.author_id, 'community', actor_name || ' also commented on a post',
         private.post_excerpt(new.body), new.post_id, new.author_id
  from public.community_post_comments c
  where c.post_id = new.post_id
    and c.id <> new.id
    and c.author_id <> new.author_id
    and c.author_id <> post_author;

  return new;
end;
$$;

revoke all on function private.notify_post_comment() from public, anon, authenticated;
drop trigger if exists community_post_comments_notify on public.community_post_comments;
create trigger community_post_comments_notify
  after insert on public.community_post_comments
  for each row execute function private.notify_post_comment();

-- ---------------------------------------------------------------------------
-- New posts, reports, restores (community_posts insert/update)
-- ---------------------------------------------------------------------------

create or replace function private.notify_post_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author_name text;
begin
  select display_name into author_name from public.profiles where id = new.author_id;

  insert into public.notifications (recipient_id, kind, title, body, related_id, actor_id)
  select case when pc.requester_id = new.author_id then pc.recipient_id else pc.requester_id end,
         'community', coalesce(author_name, 'A player') || ' shared a new post',
         private.post_excerpt(new.body), new.id, new.author_id
  from public.player_connections pc
  where pc.status = 'accepted'
    and (pc.requester_id = new.author_id or pc.recipient_id = new.author_id);

  return new;
end;
$$;

revoke all on function private.notify_post_created() from public, anon, authenticated;
drop trigger if exists community_posts_notify_created on public.community_posts;
create trigger community_posts_notify_created
  after insert on public.community_posts
  for each row execute function private.notify_post_created();

create or replace function private.notify_post_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_reported and not old.is_reported then
    insert into public.notifications (recipient_id, kind, title, body, related_id)
    values (new.author_id, 'community', 'Your post was reported',
            'It''s hidden from the feed while an admin reviews it.', new.id);

    insert into public.notifications (recipient_id, kind, title, body, related_id)
    select u.id, 'community', 'A post was reported', private.post_excerpt(new.body), new.id
    from auth.users u
    where u.raw_app_meta_data ->> 'role' = 'admin'
      and u.id <> new.author_id;
  elsif old.is_reported and not new.is_reported then
    insert into public.notifications (recipient_id, kind, title, body, related_id)
    values (new.author_id, 'community', 'Your post was restored',
            'An admin reviewed your post and it''s visible in the feed again.', new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.notify_post_moderation() from public, anon, authenticated;
drop trigger if exists community_posts_notify_moderation on public.community_posts;
create trigger community_posts_notify_moderation
  after update of is_reported on public.community_posts
  for each row execute function private.notify_post_moderation();

-- ---------------------------------------------------------------------------
-- Admin removes someone else's post
-- ---------------------------------------------------------------------------

create or replace function private.notify_post_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Authors deleting their own post don't need telling. auth.uid() is null
  -- for account deletion cascades, which also shouldn't notify.
  if auth.uid() is null or auth.uid() = old.author_id then
    return old;
  end if;

  insert into public.notifications (recipient_id, kind, title, body)
  values (old.author_id, 'community', 'Your post was removed by an admin',
          private.post_excerpt(old.body));

  return old;
end;
$$;

revoke all on function private.notify_post_removed() from public, anon, authenticated;
drop trigger if exists community_posts_notify_removed on public.community_posts;
create trigger community_posts_notify_removed
  after delete on public.community_posts
  for each row execute function private.notify_post_removed();
