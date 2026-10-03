import { buildDayOptions, canCancelReservation, courtsNearLocation, nextUpcomingReservation, parseSlotLabel, slotHasStarted, slotOverlapsBusy } from "./DashboardContext";

describe("courtsNearLocation", () => {
  const location = { latitude: 7.4478, longitude: 125.8083 };
  const near = { id: "near", latitude: 7.4479, longitude: 125.8084 };
  const far = { id: "far", latitude: 7.55, longitude: 125.95 };

  it("returns the courts unchanged when there is no location", () => {
    expect(courtsNearLocation([near, far], null)).toEqual([near, far]);
  });

  it("sorts courts by distance and drops ones without coordinates", () => {
    const noCoords = { id: "no-coords", latitude: null, longitude: null };
    const sorted = courtsNearLocation([far, near, noCoords], location);
    expect(sorted.map((court) => court.id)).toEqual(["near", "far"]);
  });
});

describe("parseSlotLabel", () => {
  it("converts 12-hour labels to 24-hour hour/minute", () => {
    expect(parseSlotLabel("4:00 PM")).toEqual({ hour: 16, minute: 0 });
    expect(parseSlotLabel("12:00 AM")).toEqual({ hour: 0, minute: 0 });
    expect(parseSlotLabel("12:00 PM")).toEqual({ hour: 12, minute: 0 });
    expect(parseSlotLabel("6:00 AM")).toEqual({ hour: 6, minute: 0 });
  });
});

describe("buildDayOptions", () => {
  it("labels the first two days as Today and Tomorrow", () => {
    const days = buildDayOptions(3);
    expect(days).toHaveLength(3);
    expect(days[0].label).toBe("Today");
    expect(days[1].label).toBe("Tomorrow");
  });
});

describe("slotOverlapsBusy", () => {
  const day = new Date("2026-01-15T00:00:00");

  it("detects an overlapping busy range", () => {
    const busyRanges = [{ start_time: "2026-01-15T16:00:00", end_time: "2026-01-15T17:00:00" }];
    expect(slotOverlapsBusy(day, "4:00 PM", busyRanges)).toBe(true);
  });

  it("returns false when no busy range overlaps the slot", () => {
    const busyRanges = [{ start_time: "2026-01-15T16:00:00", end_time: "2026-01-15T17:00:00" }];
    expect(slotOverlapsBusy(day, "5:00 PM", busyRanges)).toBe(false);
  });
});

describe("nextUpcomingReservation", () => {
  const now = new Date("2026-05-01T12:00:00Z").getTime();
  const at = (iso, status = "pending", id = iso) => ({ id, start_time: iso, status });

  it("returns the soonest active reservation that has not started", () => {
    const list = [at("2026-05-03T10:00:00Z"), at("2026-05-02T10:00:00Z", "confirmed"), at("2026-04-30T10:00:00Z")];
    expect(nextUpcomingReservation(list, now).start_time).toBe("2026-05-02T10:00:00Z");
  });

  it("ignores cancelled reservations and returns null when none remain", () => {
    expect(nextUpcomingReservation([at("2026-05-02T10:00:00Z", "cancelled")], now)).toBeNull();
  });
});

describe("canCancelReservation", () => {
  const now = new Date("2026-05-01T12:00:00Z").getTime();

  it("allows cancelling only active future reservations", () => {
    expect(canCancelReservation({ status: "pending", start_time: "2026-05-02T10:00:00Z" }, now)).toBe(true);
    expect(canCancelReservation({ status: "confirmed", start_time: "2026-04-30T10:00:00Z" }, now)).toBe(false);
    expect(canCancelReservation({ status: "cancelled", start_time: "2026-05-02T10:00:00Z" }, now)).toBe(false);
  });
});

describe("slotHasStarted", () => {
  const day = new Date("2026-01-15T00:00:00");

  it("treats slots at or before now as started", () => {
    const now = new Date("2026-01-15T16:30:00").getTime();
    expect(slotHasStarted(day, "4:00 PM", now)).toBe(true);
    expect(slotHasStarted(day, "6:00 AM", now)).toBe(true);
    expect(slotHasStarted(day, "5:00 PM", now)).toBe(false);
  });

  it("never blocks slots on a later day", () => {
    const now = new Date("2026-01-14T23:00:00").getTime();
    expect(slotHasStarted(day, "6:00 AM", now)).toBe(false);
  });
});
