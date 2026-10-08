import { bookingPrice, findNextAvailable, googleCalendarUrl, partitionSlots, reminderTime, reviewBarText, selectionAvailable, selectionSlots, timeRangeLabel, toggleSlot } from "./booking";

const day = new Date(2026, 9, 7);
day.setHours(0, 0, 0, 0);
const morning = new Date(2026, 9, 7, 5, 0).getTime();
const busyAt = (h) => ({ start_time: new Date(2026, 9, 7, h).toISOString(), end_time: new Date(2026, 9, 7, h + 1).toISOString() });

describe("toggleSlot", () => {
  it("extends with the next consecutive hour and trims from inside", () => {
    let sel = toggleSlot(null, "3:00 PM", day, [], morning);
    expect(sel).toEqual({ start: "3:00 PM", hours: 1 });
    sel = toggleSlot(sel, "4:00 PM", day, [], morning);
    sel = toggleSlot(sel, "5:00 PM", day, [], morning);
    expect(sel).toEqual({ start: "3:00 PM", hours: 3 });
    expect(selectionSlots(sel)).toEqual(["3:00 PM", "4:00 PM", "5:00 PM"]);
    expect(toggleSlot(sel, "4:00 PM", day, [], morning)).toEqual({ start: "3:00 PM", hours: 2 });
  });

  it("starts over across a gap, and ignores taken or past slots", () => {
    const sel = { start: "7:00 AM", hours: 2 };
    expect(toggleSlot(sel, "3:00 PM", day, [], morning)).toEqual({ start: "3:00 PM", hours: 1 });
    expect(toggleSlot(sel, "6:00 PM", day, [busyAt(18)], morning)).toBe(sel);
    expect(toggleSlot(sel, "6:00 AM", day, [], new Date(2026, 9, 7, 9).getTime())).toBe(sel);
  });

  it("caps a booking at four hours", () => {
    let sel = { start: "3:00 PM", hours: 4 };
    sel = toggleSlot(sel, "7:00 PM", day, [], morning);
    expect(sel).toEqual({ start: "7:00 PM", hours: 1 });
  });
});

describe("availability and pricing", () => {
  it("checks every hour of a selection", () => {
    expect(selectionAvailable(day, { start: "3:00 PM", hours: 2 }, [], morning)).toBe(true);
    expect(selectionAvailable(day, { start: "3:00 PM", hours: 2 }, [busyAt(16)], morning)).toBe(false);
  });

  it("totals the price and labels the range", () => {
    expect(bookingPrice(150, 2)).toEqual({ perHour: 150, hours: 2, total: 300 });
    expect(bookingPrice(null, 2)).toBeNull();
    expect(timeRangeLabel(day, { start: "4:00 PM", hours: 2 })).toMatch(/4:00.*6:00/);
  });

  it("finds the next free slot on a later day", async () => {
    const today = { key: "t", date: day };
    const tomorrow = { key: "m", date: new Date(2026, 9, 8) };
    const allBusy = [6, 7, 8, 15, 16, 17, 18, 19].map(busyAt);
    const found = await findNextAvailable([today, tomorrow], async (d) => (d === today ? allBusy : []), morning);
    expect(found).toEqual({ day: tomorrow, label: "6:00 AM" });
  });
});

describe("follow-ups", () => {
  it("builds a Google Calendar template link", () => {
    const url = googleCalendarUrl({ title: "Pickleball", start: new Date(Date.UTC(2026, 9, 7, 8)), end: new Date(Date.UTC(2026, 9, 7, 10)) });
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20261007T080000Z%2F20261007T100000Z");
  });

  it("reminds an hour before, or 15 minutes before when that's too late", () => {
    const start = new Date(2026, 9, 7, 16);
    expect(reminderTime(start, new Date(2026, 9, 7, 12).getTime()).getHours()).toBe(15);
    expect(reminderTime(start, new Date(2026, 9, 7, 15, 30).getTime()).getMinutes()).toBe(45);
    expect(reminderTime(start, new Date(2026, 9, 7, 15, 50).getTime())).toBeNull();
  });
});

describe("partitionSlots", () => {
  const slots = ["6:00 AM", "7:00 AM", "3:00 PM", "4:00 PM"];

  it("moves slots that already started today out of the grid", () => {
    const afternoon = new Date(2026, 9, 7, 15, 30).getTime();
    expect(partitionSlots(slots, day, afternoon)).toEqual({ upcoming: ["4:00 PM"], started: ["6:00 AM", "7:00 AM", "3:00 PM"] });
  });

  it("leaves future days untouched", () => {
    const tomorrow = new Date(2026, 9, 8);
    expect(partitionSlots(slots, tomorrow, morning)).toEqual({ upcoming: slots, started: [] });
  });

  it("reports nothing left once the last slot has started", () => {
    const night = new Date(2026, 9, 7, 23, 0).getTime();
    expect(partitionSlots(slots, day, night).upcoming).toEqual([]);
  });
});

describe("reviewBarText", () => {
  it("shows the per-slot price and the running total", () => {
    const text = reviewBarText({ selection: { start: "4:00 PM", hours: 2 }, hourlyRate: 150, dayLabel: "Today", rangeLabel: "4:00 – 6:00 PM" });
    expect(text.summary).toMatch(/₱150 per slot × 2/);
    expect(text.label).toBe("Review · ₱300 total");
  });

  it("handles courts without a listed price and an empty selection", () => {
    expect(reviewBarText({ selection: { start: "4:00 PM", hours: 1 }, hourlyRate: null, dayLabel: "Today", rangeLabel: "4–5 PM" }).summary).toMatch(/pay at the venue/);
    expect(reviewBarText({ selection: null, hourlyRate: 150 })).toEqual({ summary: null, label: "Pick a time" });
  });
});