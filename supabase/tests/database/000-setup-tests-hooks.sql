-- Runs before the numbered database tests. This file is for the local test
-- database only; do not run it in a hosted project's SQL Editor.
--
-- The helper extension provides tests.create_supabase_user(),
-- tests.get_supabase_uid(), and tests.authenticate_as().

create extension if not exists pgtap with schema extensions;

create extension if not exists http with schema extensions;
create extension if not exists pg_tle;

drop extension if exists "supabase-dbdev";
select pgtle.uninstall_extension_if_exists('supabase-dbdev');

select pgtle.install_extension(
  'supabase-dbdev',
  response.contents ->> 'version',
  'PostgreSQL package manager',
  response.contents ->> 'sql'
)
from extensions.http(
  (
    'GET',
    'https://api.database.dev/rest/v1/package_versions?select=sql,version'
      || '&package_name=eq.supabase-dbdev&order=version.desc&limit=1',
    array[
      (
        'apiKey',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtdXB0cHBsZnZpaWZyYndtbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODAxMDczNzIsImV4cCI6MTk5NTY4MzM3Mn0.z2CN0mvO2No8wSi46Gw59DFGCTJrzM1AQKsu_5k134s'
      )::extensions.http_header
    ],
    null,
    null
  )
) request,
lateral (
  select ((row_to_json(request) -> 'content') #>> '{}')::json -> 0 as contents
) response;

create extension "supabase-dbdev";
select dbdev.install('supabase-dbdev');
select dbdev.install('basejump-supabase_test_helpers');
create extension if not exists "basejump-supabase_test_helpers" version '0.0.6';

begin;
select extensions.plan(1);
select extensions.ok(true, 'pgTAP and Supabase test helpers are available');
select * from extensions.finish();
rollback;
