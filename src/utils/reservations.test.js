import { adminActionsFor, calendarBookingFor, canAddToCalendar, reservationBadgeKey } from "./reservations";

const now = new Date("2026-10-08T08:00:00Z").getTime();
const booking = (status, startIso = "2026-10-09T08:00:00Z", endIso = "2026-10-09T10:00:00Z") => ({ id: "r1", status, start_time: startIso, end_time: endIso });

describe("reservation lifecycle", () => {
  it("only offers the calendar for upcoming bookings that hold the slot", () => {
    expect(canAddToCalendar(booking("pending"), now)).toBe(true);
    expect(canAddToCalendar(booking("confirmed"), now)).toBe(true);
    expect(canAddToCalendar(booking("declined"), now)).toBe(false);
    expect(canAddToCalendar(booking("cancelled"), now)).toBe(false);
    expect(canAddToCalendar(booking("confirmed", "2026-10-07T08:00:00Z", "2026-10-07T09:00:00Z"), now)).toBe(false);
  });

  it("gives admins confirm/decline only while pending", () => {
    expect(adminActionsFor(booking("pending"))).toEqual(["confirm", "decline", "cancel"]);
    expect(adminActionsFor(booking("confirmed"))).toEqual(["cancel"]);
    expect(adminActionsFor(booking("declined"))).toEqual([]);
  });

  it("labels past active bookings as past and keeps final states", () => {
    expect(reservationBadgeKey(booking("confirmed", "2026-10-07T08:00:00Z"), now)).toBe("past");
    expect(reservationBadgeKey(booking("declined", "2026-10-07T08:00:00Z"), now)).toBe("declined");
    expect(reservationBadgeKey(booking("pending"), now)).toBe("pending");
  });

  it("builds calendar details, defaulting to one hour without an end time", () => {
    const event = calendarBookingFor({ start_time: "2026-10-09T08:00:00Z", end_time: null }, { name: "Magugpo", address: "Tagum" });
    expect(event.courtName).toBe("Magugpo");
    expect(event.end.getTime() - event.start.getTime()).toBe(3600 * 1000);
  });
});
