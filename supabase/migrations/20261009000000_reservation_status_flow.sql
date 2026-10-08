-- Reservation status flow: pending -> confirmed | declined | cancelled.
--
-- Additive only (no columns removed, no rows rewritten):
--   1. reservations.status also accepts 'declined' (the venue turned it down).
--   2. Players can only create pending bookings and can only cancel them;
--      confirming / declining is an admin action. Server-side writes
--      (service role, SQL editor, seed script: no auth.uid()) are unaffected.
--   3. The "Reservation received" notification now names the court and time
--      and links to the booking (related_id), and is created once per booking.
--   4. Every status change notifies the player (confirmed, declined, cancelled
--      by the venue). A player cancelling their own booking isn't notified.
--      One row per (booking, status): repeats are refreshed, not duplicated.
-- Admins previously inserted the confirm/cancel notification from the app; the
-- app no longer does, so this migration must be applied for those to arrive.

-- 1. Allow 'declined' -------------------------------------------------------
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'declined', 'cancelled'));

-- 2. Players: create pending, cancel only ----------------------------------
create or replace function private.guard_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (select private.is_admin()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (new.status = 'cancelled' and old.status in ('pending', 'confirmed')) then
      raise exception 'Only the venue can change a booking to %', new.status
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_reservation_status() from public, anon, authenticated;
drop trigger if exists reservations_guard_status on public.reservations;
create trigger reservations_guard_status
  before insert or update of status on public.reservations
  for each row execute function private.guard_reservation_status();

-- 3 + 4. Notifications --------------------------------------------------------
-- "Magugpo Court · Fri Oct 9, 4:00 PM" in Philippine time.
create or replace function private.reservation_label(p_reservation public.reservations)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.name from public.courts c where c.id = p_reservation.court_id), 'Your court')
    || ' · '
    || to_char(p_reservation.start_time at time zone 'Asia/Manila', 'Dy Mon FMDD, FMHH12:MI AM');
$$;

revoke all on function private.reservation_label(public.reservations) from public, anon, authenticated;

-- Inserts a reservation notification, or refreshes the existing one for the
-- same booking and title (marks it unread and moves it to the top).
create or replace function private.upsert_reservation_notification(
  p_reservation public.reservations,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set body = p_body, is_read = false, created_at = now()
   where recipient_id = p_reservation.user_id
     and kind = 'reservation'
     and related_id = p_reservation.id
     and title = p_title;
  if not found then
    insert into public.notifications (recipient_id, kind, title, body, related_id)
    values (p_reservation.user_id, 'reservation', p_title, p_body, p_reservation.id);
  end if;
end;
$$;

revoke all on function private.upsert_reservation_notification(public.reservations, text, text) from public, anon, authenticated;

create or replace function private.create_reservation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.upsert_reservation_notification(
    new,
    'Reservation received',
    private.reservation_label(new) || ' — pending confirmation from the venue.'
  );
  return new;
end;
$$;

create or replace function private.notify_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text;
  suffix text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- The player cancelled it themselves: nothing to tell them.
  if new.status = 'cancelled' and (select auth.uid()) = new.user_id then
    return new;
  end if;

  title := case new.status
    when 'confirmed' then 'Reservation confirmed'
    when 'declined' then 'Reservation declined'
    when 'cancelled' then 'Reservation cancelled'
    else 'Reservation updated'
  end;
  suffix := case new.status
    when 'confirmed' then ' — see you on court!'
    when 'declined' then ' — the venue couldn''t take this booking. Try another time.'
    when 'cancelled' then ' — cancelled by the venue.'
    else ''
  end;

  perform private.upsert_reservation_notification(new, title, private.reservation_label(new) || suffix);
  return new;
end;
$$;

revoke all on function private.notify_reservation_status() from public, anon, authenticated;
drop trigger if exists reservations_notify_status on public.reservations;
create trigger reservations_notify_status
  after update of status on public.reservations
  for each row execute function private.notify_reservation_status();
