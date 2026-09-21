-- Core schema baseline. This must run before the Auth trigger and RLS
-- migrations so `supabase db reset` has every table they reference.
-- Policies and client grants are intentionally defined in the following RLS
-- migration, not here.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  location text,
  skill_level numeric(2,1) not null default 3.0 check (skill_level between 1.0 and 5.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists preferred_game_type text not null default 'Doubles'
    check (preferred_game_type in ('Singles', 'Doubles', 'Either')),
  add column if not exists is_directory_visible boolean not null default true;

create table if not exists public.courts (
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

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  court_id uuid not null references public.courts(id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create index if not exists reservations_upcoming_by_user_idx
  on public.reservations (user_id, start_time)
  where status in ('pending', 'confirmed');

alter table public.courts
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists schedule_note text,
  add column if not exists photo_urls text[] not null default '{}';

create table if not exists public.game_records (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  played_on date not null default current_date,
  opponents text not null check (char_length(trim(opponents)) between 1 and 240),
  player_score smallint not null check (player_score between 0 and 99),
  opponent_score smallint not null check (opponent_score between 0 and 99),
  result text generated always as (case when player_score > opponent_score then 'win' else 'loss' end) stored,
  created_at timestamptz not null default now(),
  check (player_score <> opponent_score)
);

create index if not exists game_records_player_played_on_idx
  on public.game_records (player_id, played_on desc);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  photo_urls text[] not null default '{}',
  is_reported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_feed_idx on public.community_posts (created_at desc);
create index if not exists community_posts_author_idx on public.community_posts (author_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'community_posts'
  ) then
    alter publication supabase_realtime add table public.community_posts;
  end if;
end;
$$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reservation', 'game_invitation', 'community', 'system')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
