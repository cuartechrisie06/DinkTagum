-- Run this once only if public.courts was already created before GPS support.
-- Add each court's latitude and longitude in Supabase Table Editor to enable distance sorting.

alter table public.courts
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180);
