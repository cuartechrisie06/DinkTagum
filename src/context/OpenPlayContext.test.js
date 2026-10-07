import { buildOpenGame, capacityFor, openGameForDisplay, skillLabel } from "./OpenPlayContext";

const now = new Date("2026-10-06T12:00:00").getTime();
const base = { courtId: "c1", dayKey: "2026-10-07", timeLabel: "4:00 PM", format: "Doubles", skillKey: "intermediate", note: "  Friendly game " };

describe("buildOpenGame", () => {
  it("builds a row with a local start time and the chosen skill range", () => {
    const { value } = buildOpenGame(base, now);
    expect(new Date(value.starts_at).getHours()).toBe(16);
    expect(value).toMatchObject({ court_id: "c1", format: "Doubles", skill_min: 3.0, skill_max: 3.5, note: "Friendly game" });
  });

  it("rejects a missing court, a past time, and an over-long note", () => {
    expect(buildOpenGame({ ...base, courtId: "" }, now).error).toMatch(/court/);
    expect(buildOpenGame({ ...base, dayKey: "2026-10-06", timeLabel: "6:00 AM" }, now).error).toMatch(/passed/);
    expect(buildOpenGame({ ...base, note: "x".repeat(281) }, now).error).toMatch(/280/);
  });

  it("defaults to any level and a null note", () => {
    const { value } = buildOpenGame({ ...base, skillKey: undefined, note: " " }, now);
    expect(value).toMatchObject({ skill_min: null, skill_max: null, note: null });
  });
});

describe("open game display", () => {
  it("sizes Singles at 2 and Doubles at 4", () => {
    expect(capacityFor("Singles")).toBe(2);
    expect(capacityFor("Doubles")).toBe(4);
  });

  it("works out spots, fullness, and the viewer's role", () => {
    const row = { game_id: "g1", host_id: "h", format: "Doubles", capacity: 4, players: [{ id: "h" }, { id: "me" }] };
    expect(openGameForDisplay(row, "me")).toMatchObject({ id: "g1", spotsLeft: 2, isFull: false, isHost: false, isJoined: true });
    expect(openGameForDisplay({ ...row, players: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }, "me")).toMatchObject({ isFull: true, isJoined: false });
  });

  it("labels skill ranges", () => {
    expect(skillLabel({ skill_min: null, skill_max: null })).toBe("Any level");
    expect(skillLabel({ skill_min: 3, skill_max: 3.5 })).toBe("3.0–3.5");
    expect(skillLabel({ skill_min: 4, skill_max: 5 })).toBe("4.0+");
  });
});
