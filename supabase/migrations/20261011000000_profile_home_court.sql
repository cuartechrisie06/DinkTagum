-- Home court on the player profile. Additive: a nullable column, nothing else
-- changes. Used for "Home court" on Profile and the distance filter on Find
-- Players (distance between you and a player's home court).
-- Profiles' existing RLS already lets players update their own row and read
-- directory-visible profiles, so no policy changes are needed.

alter table public.profiles
  add column if not exists home_court_id uuid references public.courts(id) on delete set null;

create index if not exists profiles_home_court_idx on public.profiles (home_court_id) where home_court_id is not null;
