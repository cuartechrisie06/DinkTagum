-- Lets any signed-in player report someone else's community post.
--
-- The is_reported guard trigger previously rejected every non-admin change,
-- which also blocked this SECURITY DEFINER function (auth.jwt() still carries
-- the caller's claims inside it). The guard now only applies to the client
-- API roles, so direct UPDATEs from players stay blocked while trusted
-- server-side functions — running as their owner — can set the flag.

create or replace function private.guard_community_post_report_flag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_reported is distinct from old.is_reported
     and current_user in ('authenticated', 'anon')
     and not private.is_admin() then
    raise exception 'Only administrators can change is_reported'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Flags a post for admin review. Reporting only ever sets the flag (players
-- cannot un-report), and a player cannot report their own post.
create or replace function public.report_community_post(p_post_id uuid)
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

  select author_id into post_author from public.community_posts where id = p_post_id;
  if post_author is null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if post_author = me then
    raise exception 'You cannot report your own post' using errcode = '22023';
  end if;

  update public.community_posts set is_reported = true where id = p_post_id;
end;
$$;

revoke all on function public.report_community_post(uuid) from public, anon, authenticated;
grant execute on function public.report_community_post(uuid) to authenticated;
