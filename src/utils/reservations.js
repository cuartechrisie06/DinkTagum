// Reservation lifecycle rules shared by the court page, History and Admin.
//
//   pending ──venue──> confirmed
//      │  └──venue──> declined
//      └──player / venue──> cancelled      (confirmed can be cancelled too)
//
// Only pending and confirmed hold the slot (see reservations_no_overlapping_slots).

export const RESERVATION_STATUSES = ["pending", "confirmed", "declined", "cancelled"];
export const ACTIVE_STATUSES = ["pending", "confirmed"];

export function isActiveReservation(reservation) {
  return ACTIVE_STATUSES.includes(reservation?.status);
}

function endOf(reservation) {
  const start = new Date(reservation.start_time).getTime();
  const end = reservation.end_time ? new Date(reservation.end_time).getTime() : start + 3600 * 1000;
  return { start, end };
}

// Upcoming bookings that still hold the slot can go on the calendar.
export function canAddToCalendar(reservation, now = Date.now()) {
  return isActiveReservation(reservation) && endOf(reservation).end > now;
}

// Admin actions available for a reservation's current status.
export function adminActionsFor(reservation) {
  if (reservation.status === "pending") return ["confirm", "decline", "cancel"];
  if (reservation.status === "confirmed") return ["cancel"];
  return [];
}

// What a badge should say: an active booking whose time has passed is "Past".
export function reservationBadgeKey(reservation, now = Date.now()) {
  if (isActiveReservation(reservation) && new Date(reservation.start_time).getTime() < now) return "past";
  return RESERVATION_STATUSES.includes(reservation.status) ? reservation.status : "pending";
}

// Input for addBookingToCalendar / shareBooking.
export function calendarBookingFor(reservation, court) {
  const { start, end } = endOf(reservation);
  return { courtName: court?.name || "Pickleball court", address: court?.address || "", start: new Date(start), end: new Date(end) };
}
