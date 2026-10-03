import { initialsFor, relativeTime, reservationTime } from "./format";

describe("initialsFor", () => {
  it("takes the first letter of up to two words", () => {
    expect(initialsFor("RJ Delos Santos")).toBe("RD");
    expect(initialsFor("Angel")).toBe("A");
  });

  it("falls back when the name is empty", () => {
    expect(initialsFor("")).toBe("DT");
    expect(initialsFor(null)).toBe("DT");
    expect(initialsFor(undefined, "??")).toBe("??");
  });

  it("collapses repeated whitespace", () => {
    expect(initialsFor("  Ana   Cruz  ")).toBe("AC");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns 'Just now' for very recent timestamps", () => {
    expect(relativeTime(new Date(now.getTime() - 5 * 1000).toISOString())).toBe("Just now");
  });

  it("formats minutes and hours ago", () => {
    expect(relativeTime(new Date(now.getTime() - 5 * 60 * 1000).toISOString())).toBe("5m ago");
    expect(relativeTime(new Date(now.getTime() - 3 * 3600 * 1000).toISOString())).toBe("3h ago");
  });

  it("falls back to a date once a day has passed", () => {
    const dayAgo = new Date(now.getTime() - 25 * 3600 * 1000);
    expect(relativeTime(dayAgo.toISOString())).toBe(dayAgo.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  });
});

describe("reservationTime", () => {
  it("returns a placeholder when there is no reservation", () => {
    expect(reservationTime(null)).toBe("Time to be confirmed");
    expect(reservationTime({})).toBe("Time to be confirmed");
  });

  it("formats a start and end time range", () => {
    const text = reservationTime({ start_time: "2026-01-15T16:00:00", end_time: "2026-01-15T17:00:00" });
    expect(text).toContain("4:00");
    expect(text).toContain("5:00");
  });
});
