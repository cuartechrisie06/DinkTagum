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

describe("gameTimeLabel", () => {
  const { gameTimeLabel } = require("./format");
  const now = new Date("2026-10-06T09:00:00").getTime();
  it("names today and tomorrow", () => {
    expect(gameTimeLabel(new Date("2026-10-06T16:00:00").toISOString(), now)).toMatch(/^Today · /);
    expect(gameTimeLabel(new Date("2026-10-07T06:00:00").toISOString(), now)).toMatch(/^Tomorrow · /);
  });

  it("uses a short date further out", () => {
    expect(gameTimeLabel(new Date("2026-10-10T16:00:00").toISOString(), now)).not.toMatch(/Today|Tomorrow/);
  });
});

describe("skillTier", () => {
  const { skillTier } = require("./format");
  it("maps the 1.0–5.0 scale to tiers", () => {
    expect(skillTier(2.0)).toBe("Beginner");
    expect(skillTier(2.5)).toBe("Developing");
    expect(skillTier(3.5)).toBe("Intermediate");
    expect(skillTier(4.0)).toBe("Advanced");
    expect(skillTier(5)).toBe("Expert");
    expect(skillTier(null)).toBe("Intermediate");
  });
});

describe("chat and notification grouping", () => {
  const { dayLabel, endsMessageGroup, groupByRecency } = require("./format");
  const now = new Date(2026, 9, 7, 12).getTime();

  it("labels days", () => {
    expect(dayLabel(new Date(2026, 9, 7, 8), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 6, 23), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 1, 9), now)).not.toMatch(/Today|Yesterday/);
  });

  it("ends a message group on sender change, a 5-minute gap, or the last message", () => {
    const a = { sender_id: "me", created_at: new Date(2026, 9, 7, 10, 0).toISOString() };
    expect(endsMessageGroup(a, { sender_id: "me", created_at: new Date(2026, 9, 7, 10, 2).toISOString() })).toBe(false);
    expect(endsMessageGroup(a, { sender_id: "me", created_at: new Date(2026, 9, 7, 10, 9).toISOString() })).toBe(true);
    expect(endsMessageGroup(a, { sender_id: "you", created_at: new Date(2026, 9, 7, 10, 1).toISOString() })).toBe(true);
    expect(endsMessageGroup(a, undefined)).toBe(true);
  });

  it("splits rows into Today and Earlier, dropping empty sections", () => {
    const rows = [{ id: 1, created_at: new Date(2026, 9, 7, 9).toISOString() }, { id: 2, created_at: new Date(2026, 9, 5).toISOString() }];
    expect(groupByRecency(rows, now).map((s) => [s.title, s.data.map((r) => r.id)])).toEqual([["Today", [1]], ["Earlier", [2]]]);
    expect(groupByRecency([rows[1]], now).map((s) => s.title)).toEqual(["Earlier"]);
  });
});
