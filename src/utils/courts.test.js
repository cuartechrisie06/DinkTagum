import { activeFilterCount, amenityOptions, enrichCourt, filterCourts, formatClock, nextOpenSlot, openState, parseHoursText, sortCourts, timeInputToDb } from "./courts";

const at = (h, m = 0) => new Date(2026, 9, 7, h, m).getTime();

describe("parseHoursText", () => {
  it("reads 12-hour ranges in common shapes", () => {
    expect(parseHoursText("6:00 AM – 10:00 PM")).toEqual({ open: 360, close: 1320 });
    expect(parseHoursText("5AM-9PM daily")).toEqual({ open: 300, close: 1260 });
    expect(parseHoursText("12:00 PM - 12:00 AM")).toEqual({ open: 720, close: 0 });
  });

  it("reads 24-hour ranges and rejects free text", () => {
    expect(parseHoursText("06:00 - 22:00")).toEqual({ open: 360, close: 1320 });
    expect(parseHoursText("Closed for renovation")).toBeNull();
    expect(parseHoursText(null)).toBeNull();
  });
});

describe("openState", () => {
  const court = { status: "Available", hours: "6:00 AM – 10:00 PM" };

  it("labels open and closed times", () => {
    expect(openState(court, at(9))).toMatchObject({ open: true, label: "Open until 10 PM" });
    expect(openState(court, at(5))).toMatchObject({ open: false, label: "Opens 6 AM" });
    expect(openState(court, at(23))).toMatchObject({ open: false, label: "Opens tomorrow 6 AM" });
  });

  it("prefers structured times, handles overnight hours, and respects admin closures", () => {
    expect(openState({ ...court, opensAt: "08:30:00", closesAt: "20:00:00" }, at(8))).toMatchObject({ label: "Opens 8:30 AM" });
    expect(openState({ status: "Available", hours: "6:00 PM - 2:00 AM" }, at(1))).toMatchObject({ open: true });
    expect(openState({ ...court, status: "Closed" }, at(9))).toMatchObject({ open: false, temporary: true });
    expect(openState({ status: "Available", hours: "Call ahead" }, at(9))).toMatchObject({ known: false });
  });
});

describe("nextOpenSlot", () => {
  const court = { status: "Available" };

  it("finds the first free slot today, else tomorrow", () => {
    expect(nextOpenSlot(court, [], at(10))).toMatchObject({ label: "3:00 PM", today: true });
    const busy = ["3", "4", "5", "6", "7"].map((h) => ({ start_time: new Date(2026, 9, 7, Number(h) + 12).toISOString(), end_time: new Date(2026, 9, 7, Number(h) + 13).toISOString() }));
    expect(nextOpenSlot(court, busy, at(10))).toMatchObject({ label: "Tomorrow 6:00 AM", today: false });
  });

  it("is null for courts not taking bookings or without availability data", () => {
    expect(nextOpenSlot({ status: "Full" }, [], at(10))).toBeNull();
    expect(nextOpenSlot(court, null, at(10))).toBeNull();
  });
});

describe("enrich, filter and sort", () => {
  const base = { amenities: [], status: "Available", hours: "6:00 AM - 10:00 PM" };
  const courts = [
    enrichCourt({ ...base, id: "a", name: "Alpha", rating: 4.2, hourlyRate: 150, dist: "2.0 km", amenities: ["Lights", "Parking"] }, { busyByCourt: {}, favoriteIds: new Set(["a"]), now: at(10) }),
    enrichCourt({ ...base, id: "b", name: "Bravo", rating: 4.9, hourlyRate: null, dist: "0.5 km", amenities: ["Covered"] }, { busyByCourt: {}, now: at(10) }),
    enrichCourt({ ...base, id: "c", name: "Charlie", rating: 3.0, hourlyRate: 100, dist: "Distance unavailable", status: "Closed" }, { busyByCourt: {}, now: at(10) }),
  ];

  it("derives surface, lighting, favorites and next slot", () => {
    expect(courts[0]).toMatchObject({ lighting: true, isFavorite: true, nextSlot: { label: "3:00 PM" } });
    expect(courts[1]).toMatchObject({ surface: "Covered", lighting: false });
    expect(courts[2].nextSlot).toBeNull();
  });

  it("filters by price, lighting, surface, open now, favorites and amenities", () => {
    const ids = (filters) => filterCourts(courts, filters).map((c) => c.id);
    expect(ids({ maxPrice: 120 })).toEqual(["c"]);
    expect(ids({ lighting: true })).toEqual(["a"]);
    expect(ids({ surface: "Covered" })).toEqual(["b"]);
    expect(ids({ openNow: true })).toEqual(["a", "b"]);
    expect(ids({ favoritesOnly: true })).toEqual(["a"]);
    expect(ids({ amenities: ["Parking"] })).toEqual(["a"]);
    expect(activeFilterCount({ lighting: true, amenities: ["Parking", "Covered"] })).toBe(3);
  });

  it("sorts nearest, top rated, cheapest and available now", () => {
    const ids = (key) => sortCourts(courts, key).map((c) => c.id);
    expect(ids("nearest")).toEqual(["b", "a", "c"]);
    expect(ids("rating")).toEqual(["b", "a", "c"]);
    expect(ids("cheapest")).toEqual(["c", "a", "b"]);
    expect(ids("available")).toEqual(["a", "b", "c"]);
  });

  it("reads surface from amenities", () => {
    expect(enrichCourt({ ...base, id: "d", name: "D", amenities: ["Outdoor", "Lights"] }).surface).toBe("Outdoor");
  });

  it("lists amenities without lighting or surface words", () => {
    expect(amenityOptions(courts)).toEqual(["Parking"]);
  });
});

describe("formatting helpers", () => {
  it("formats clock times", () => {
    expect(formatClock(360)).toBe("6 AM");
    expect(formatClock(1290)).toBe("9:30 PM");
    expect(formatClock(0)).toBe("12 AM");
  });

  it("converts admin time input to a Postgres time", () => {
    expect(timeInputToDb("6:00 AM")).toEqual({ value: "06:00" });
    expect(timeInputToDb("9pm")).toEqual({ value: "21:00" });
    expect(timeInputToDb("18:30")).toEqual({ value: "18:30" });
    expect(timeInputToDb("")).toEqual({ value: null });
    expect(timeInputToDb("25:00").error).toBe(true);
    expect(timeInputToDb("noon").error).toBe(true);
  });
});
