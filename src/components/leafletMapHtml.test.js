import { pinLabel, shortTime, toMapPins } from "./leafletMapHtml";

describe("map pins", () => {
  const court = { id: "c1", name: "Magugpo Pickleball Court", latitude: 7.44, longitude: 125.8, status: "Available", hourlyRate: 150 };

  it("shows the price and today's next open slot", () => {
    expect(pinLabel({ ...court, nextSlot: { label: "4:00 PM", today: true } })).toBe("₱150 · 4PM");
    expect(pinLabel({ ...court, nextSlot: { label: "Tomorrow 6:00 AM", today: false } })).toBe("₱150");
    expect(pinLabel({ ...court, status: "Closed", nextSlot: { label: "4:00 PM", today: true } })).toBe("₱150");
  });

  it("falls back to a short name without a price", () => {
    expect(pinLabel({ ...court, hourlyRate: null })).toBe("Magugpo Pickleb…");
  });

  it("shortens slot times", () => {
    expect(shortTime("6:30 AM")).toBe("6:30AM");
    expect(shortTime("12:00 PM")).toBe("12PM");
  });

  it("skips courts without coordinates", () => {
    expect(toMapPins([court, { ...court, id: "c2", latitude: null }]).map((p) => p.id)).toEqual(["c1"]);
  });
});
