-- DEPRECATED — do not run this file.
--
-- Canonical schema, RLS, and triggers live in supabase/migrations/.
-- Applying this legacy script after migrations can recreate a SECURITY INVOKER
-- reservation notification trigger that fails under hardened notification RLS.
--
-- Setup:
--   npx supabase db reset
--   # or against a linked project:
--   npx supabase db push
--
-- Assign administrators in Supabase Auth with app_metadata.role = 'admin'.

do $$
begin
  raise notice 'feature-foundation.sql is deprecated. Use supabase/migrations via db reset or db push.';
end;
$$;
