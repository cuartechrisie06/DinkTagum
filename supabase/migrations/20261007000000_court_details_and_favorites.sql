-- Court details for the Courts screen's cards, sorting and filters:
--
--   1. courts.surface, courts.opens_at / closes_at: structured fields behind
--      the "Indoor/Outdoor" badge and "Open now" / "Opens 8 AM". opening_hours
--      stays as the human-readable text; existing rows are backfilled from it.
--   2. favorite_courts: a player's hearted courts, synced across devices.
--   3. all_courts_busy_slots(): every court's booked ranges in one call, so the
--      list can show "Next slot: 6:00 PM" without one RPC per court. Like
--      court_busy_slots it exposes only times, never who booked.

-- ---------------------------------------------------------------------------
-- 1. Court details
-- ---------------------------------------------------------------------------

alter table public.courts
  add column if not exists surface text check (surface in ('Indoor', 'Outdoor', 'Covered')),
  add column if not exists opens_at time,
  add column if not exists closes_at time;

-- Backfill hours from free text like "6:00 AM – 10:00 PM daily". Rows whose
-- text has no two recognizable times (e.g. "Closed for renovation") stay null.
do $$
declare
  court record;
  part text[];
  times time[];
begin
  for court in
    select id, opening_hours from public.courts
    where opens_at is null and closes_at is null and opening_hours is not null
  loop
    times := array[]::time[];
    for part in
      select regexp_matches(court.opening_hours, '(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]', 'g')
    loop
      if part[1]::int between 1 and 12 then
        times := times || make_time((part[1]::int % 12) + case when upper(part[3]) = 'P' then 12 else 0 end, coalesce(part[2], '0')::int, 0);
      end if;
    end loop;
    if coalesce(array_length(times, 1), 0) >= 2 then
      update public.courts set opens_at = times[1], closes_at = times[2] where id = court.id;
    end if;
  end loop;
end;
$$;

-- Surface from amenities the venues already list.
update public.courts set surface = 'Indoor'
  where surface is null and exists (select 1 from unnest(amenities) a where a ilike '%indoor%');
update public.courts set surface = 'Covered'
  where surface is null and exists (select 1 from unnest(amenities) a where a ilike '%covered%');
update public.courts set surface = 'Outdoor'
  where surface is null and exists (select 1 from unnest(amenities) a where a ilike '%outdoor%');

-- ---------------------------------------------------------------------------
-- 2. Favorites
-- ---------------------------------------------------------------------------

create table if not exists public.favorite_courts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, court_id)
);

create index if not exists favorite_courts_court_idx on public.favorite_courts (court_id);

alter table public.favorite_courts enable row level security;
revoke all on table public.favorite_courts from anon, authenticated;
grant select, insert, delete on table public.favorite_courts to authenticated;

drop policy if exists favorite_courts_select on public.favorite_courts;
create policy favorite_courts_select on public.favorite_courts for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists favorite_courts_insert on public.favorite_courts;
create policy favorite_courts_insert on public.favorite_courts for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists favorite_courts_delete on public.favorite_courts;
create policy favorite_courts_delete on public.favorite_courts for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Busy ranges for every court
-- ---------------------------------------------------------------------------

create or replace function public.all_courts_busy_slots(p_range_start timestamptz, p_range_end timestamptz)
returns table (court_id uuid, start_time timestamptz, end_time timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.court_id, r.start_time, coalesce(r.end_time, r.start_time + interval '1 hour')
  from public.reservations r
  where auth.uid() is not null
    and p_range_end > p_range_start
    and p_range_end - p_range_start <= interval '8 days'
    and r.status in ('pending', 'confirmed')
    and r.start_time < p_range_end
    and coalesce(r.end_time, r.start_time + interval '1 hour') > p_range_start
  order by r.court_id, r.start_time;
$$;

revoke all on function public.all_courts_busy_slots(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.all_courts_busy_slots(timestamptz, timestamptz) to authenticated;
