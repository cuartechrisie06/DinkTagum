-- Creates one public profile for every new Supabase Auth user.
-- The trigger is intentionally fail-open for unexpected profile errors so an
-- auxiliary-profile failure never prevents Auth from creating the user.

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  -- user_metadata is appropriate only for display data, never authorization.
  profile_name := left(
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (new.id, profile_name)
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Keep signup available. Investigate this warning and repair the missing
    -- profile separately; do not use this exception handler for authorization.
    raise warning 'Profile creation failed for auth user %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Testing checklist (run against a local/staging project first):
-- 1. Run `supabase db reset`, then sign up with a new email through the app.
-- 2. In SQL Editor, verify exactly one row exists:
--      select id, display_name from public.profiles
--      where id = '<new-auth-user-id>';
-- 3. Sign in and update that profile; confirm its ID remains unchanged.
-- 4. Insert a duplicate profile with the same ID as a privileged test role,
--    then create/restore the trigger path and confirm ON CONFLICT does not
--    create a second row or reject the Auth user.
-- 5. Temporarily make profile insertion fail in a disposable local database;
--    confirm signup succeeds and Postgres logs a WARNING. Restore the schema
--    immediately afterwards, then repair any missing profile explicitly.
-- 6. Confirm unauthenticated clients cannot select profiles and authenticated
--    users can only update their own row under your RLS policies.
