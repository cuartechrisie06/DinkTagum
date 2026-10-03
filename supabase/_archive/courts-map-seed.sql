-- DEPRECATED — do not run this file.
--
-- Canonical schema and seed data live in supabase/migrations/. Kept only for
-- historical reference.
--
-- Run once in Supabase Dashboard > SQL Editor.
-- Adds map coordinates if needed, updates matching existing court names,
-- and inserts four Tagum City sample courts only when they are absent.

alter table public.courts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

update public.courts
set latitude = case name
      when 'Magugpo Sports Center' then 7.4478
      when 'Apokon Barangay Court' then 7.4551
      when 'New Visayas Pickle Hub' then 7.4396
      when 'Mankilam Covered Court' then 7.4532
    end,
    longitude = case name
      when 'Magugpo Sports Center' then 125.8078
      when 'Apokon Barangay Court' then 125.8125
      when 'New Visayas Pickle Hub' then 125.7986
      when 'Mankilam Covered Court' then 125.8012
    end
where name in ('Magugpo Sports Center', 'Apokon Barangay Court', 'New Visayas Pickle Hub', 'Mankilam Covered Court');

insert into public.courts (name, area, latitude, longitude, status, court_count, opening_hours, amenities, rating)
select 'Magugpo Sports Center', 'Magugpo Poblacion', 7.4478, 125.8078, 'Available', 4, '6:00 AM – 10:00 PM', array['Lights', 'Parking', 'Water'], 4.8
where not exists (select 1 from public.courts where name = 'Magugpo Sports Center');

insert into public.courts (name, area, latitude, longitude, status, court_count, opening_hours, amenities, rating)
select 'Apokon Barangay Court', 'Apokon', 7.4551, 125.8125, 'Full', 2, '6:00 AM – 9:00 PM', array['Parking'], 4.4
where not exists (select 1 from public.courts where name = 'Apokon Barangay Court');

insert into public.courts (name, area, latitude, longitude, status, court_count, opening_hours, amenities, rating)
select 'New Visayas Pickle Hub', 'New Visayas', 7.4396, 125.7986, 'Available', 3, '5:30 AM – 11:00 PM', array['Lights', 'Restroom', 'Water'], 4.9
where not exists (select 1 from public.courts where name = 'New Visayas Pickle Hub');

insert into public.courts (name, area, latitude, longitude, status, court_count, opening_hours, amenities, rating)
select 'Mankilam Covered Court', 'Mankilam', 7.4532, 125.8012, 'Closed', 1, '6:00 AM – 9:00 PM', array['Parking'], 4.2
where not exists (select 1 from public.courts where name = 'Mankilam Covered Court');
