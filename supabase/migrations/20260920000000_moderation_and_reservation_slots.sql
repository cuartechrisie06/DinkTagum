-- Lock community post moderation flags to admins, expose busy court slots
-- without leaking reservation owners, and reject overlapping bookings.

create or replace function private.guard_community_post_report_flag()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_reported is distinct from old.is_reported
     and not private.is_admin() then
    raise exception 'Only administrators can change is_reported'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_guard_report_flag on public.community_posts;
create trigger community_posts_guard_report_flag
  before update on public.community_posts
  for each row execute function private.guard_community_post_report_flag();

-- Authors may edit their own content, but the trigger blocks is_reported changes.
drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts for update to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()))
  with check (author_id = (select auth.uid()) or (select private.is_admin()));

create or replace function public.court_busy_slots(
  p_court_id uuid,
  p_range_start timestamptz,
  p_range_end timestamptz
)
returns table (start_time timestamptz, end_time timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_court_id is null or p_range_start is null or p_range_end is null or p_range_end <= p_range_start then
    raise exception 'Invalid busy-slot range';
  end if;

  return query
  select
    r.start_time,
    coalesce(r.end_time, r.start_time + interval '1 hour') as end_time
  from public.reservations r
  where r.court_id = p_court_id
    and r.status in ('pending', 'confirmed')
    and r.start_time < p_range_end
    and coalesce(r.end_time, r.start_time + interval '1 hour') > p_range_start
  order by r.start_time;
end;
$$;

revoke all on function public.court_busy_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.court_busy_slots(uuid, timestamptz, timestamptz) to anon, authenticated;

create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_no_overlapping_slots'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_no_overlapping_slots
      exclude using gist (
        court_id with =,
        tstzrange(
          start_time,
          coalesce(end_time, start_time + interval '1 hour'),
          '[)'
        ) with &&
      )
      where (status in ('pending', 'confirmed'));
  end if;
end;
$$;
