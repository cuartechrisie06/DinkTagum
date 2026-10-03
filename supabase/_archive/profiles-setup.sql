-- DEPRECATED — do not run this file.
--
-- Canonical schema, RLS, and triggers live in supabase/migrations/. This script
-- predates the hardened RLS policies in
-- supabase/migrations/20260919000200_harden_rls_policies.sql and only allows a
-- user to see their own profile (no directory/admin visibility, no delete
-- policy). Running it against a migrated project can reintroduce a weaker
-- security model. Kept only for historical reference.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  location text,
  skill_level numeric(2,1) not null default 3.0 check (skill_level between 1.0 and 5.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

-- Policies
create policy "Players can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Players can create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Players can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Trigger Function
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

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();