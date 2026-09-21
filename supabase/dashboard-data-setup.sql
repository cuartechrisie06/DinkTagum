-- Run once in Supabase Dashboard > SQL Editor.
-- This creates empty live-data tables; it deliberately does not insert sample records.

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  area text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  status text not null default 'Available' check (status in ('Available', 'Full', 'Closed')),
  court_count integer not null default 1 check (court_count > 0),
  opening_hours text,
  amenities text[] not null default '{}',
  rating numeric(2,1) check (rating between 0 and 5),
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create index reservations_upcoming_by_user_idx
  on public.reservations (user_id, start_time)
  where status in ('pending', 'confirmed');

alter table public.courts enable row level security;
alter table public.reservations enable row level security;

grant select on public.courts to authenticated;
grant select, insert on public.reservations to authenticated;

create policy "Authenticated players can view courts"
  on public.courts for select to authenticated
  using (true);

create policy "Players can view their own reservations"
  on public.reservations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Players can create their own reservations"
  on public.reservations for insert to authenticated
  with check ((select auth.uid()) = user_id);
