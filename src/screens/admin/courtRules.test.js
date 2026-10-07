import { courtFieldErrors, courtFormToRow, emptyCourt } from "./courtRules";

const valid = { ...emptyCourt, name: "Magugpo Court", court_count: "2", hourly_rate: "150", latitude: "7.44", longitude: "125.8", opens_at: "6:00 AM", closes_at: "22:00" };

describe("courtFieldErrors", () => {
  it("accepts a complete court", () => {
    expect(courtFieldErrors(valid)).toEqual({});
  });

  it("reports every bad field at once, keyed by field", () => {
    const errors = courtFieldErrors({ ...valid, name: " ", court_count: "0", rating: "6", hourly_rate: "-5", contact_phone: "call me" });
    expect(Object.keys(errors).sort()).toEqual(["contact_phone", "court_count", "hourly_rate", "name", "rating"]);
  });

  it("needs latitude and longitude together", () => {
    expect(courtFieldErrors({ ...valid, longitude: "" }).longitude).toMatch(/both/);
    expect(courtFieldErrors({ ...valid, latitude: "abc" }).latitude).toMatch(/−90 to 90/);
  });

  it("checks opening and closing times only when the details columns exist", () => {
    expect(courtFieldErrors({ ...valid, opens_at: "25:00" }).opens_at).toBeDefined();
    expect(courtFieldErrors({ ...valid, closes_at: "" }).closes_at).toMatch(/both/);
    expect(courtFieldErrors({ ...valid, opens_at: "nope" }, { details: false })).toEqual({});
  });
});

describe("courtFormToRow", () => {
  it("builds a database row", () => {
    const { value } = courtFormToRow({ ...valid, amenities: "Lights, Parking ," });
    expect(value).toMatchObject({ name: "Magugpo Court", court_count: 2, hourly_rate: 150, amenities: ["Lights", "Parking"], opens_at: "06:00", closes_at: "22:00", rating: null });
  });

  it("returns the first error plus all field errors", () => {
    const result = courtFormToRow({ ...valid, name: "" });
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/name/);
    expect(result.errors.name).toBe(result.error);
  });
});
