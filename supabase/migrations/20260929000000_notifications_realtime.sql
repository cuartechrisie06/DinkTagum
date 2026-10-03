-- notifications was the only client-facing table never added to the
-- supabase_realtime publication (community_posts and messages already were),
-- so the notification bell had no way to update live and could only ever
-- reflect whatever was loaded the last time NotificationCenter was opened.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
