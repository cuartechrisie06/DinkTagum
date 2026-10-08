jest.mock("../../lib/supabase", () => ({ supabase: null }));
const { directorySummary, filterPlayers } = require("./PlayersScreen");

const players = [
  { id: "a", display_name: "Ana", skill_level: 2.0, preferred_game_type: "Doubles", availability: ["Weekends"] },
  { id: "b", display_name: "Ben", skill_level: 3.5, preferred_game_type: "Either", availability: ["Weekday evenings"] },
  { id: "c", display_name: "Cara", skill_level: 4.5, preferred_game_type: "Singles" },
];
const ids = (opts) => filterPlayers(players, opts).map((p) => p.id);

describe("filterPlayers", () => {
  it("filters by skill band", () => {
    expect(ids({ skill: "beginner" })).toEqual(["a"]);
    expect(ids({ skill: "intermediate" })).toEqual(["b"]);
    expect(ids({ skill: "advanced" })).toEqual(["c"]);
  });

  it("matches any chosen play time and combines with game type and name", () => {
    expect(ids({ times: ["Weekends", "Weekday evenings"] })).toEqual(["a", "b"]);
    expect(ids({ gameType: "Singles" })).toEqual(["b", "c"]);
    expect(ids({ query: "ca" })).toEqual(["c"]);
  });
});

describe("directorySummary", () => {
  it("counts exactly the players the list shows", () => {
    const visible = filterPlayers(players, { query: "zzz" });
    expect(visible).toEqual([]);
    expect(directorySummary({ loading: false, visible, loaded: players, filtersActive: true })).toBe("0 players match · 3 in directory");
  });

  it("uses the filtered count, with singular/plural wording", () => {
    const one = filterPlayers(players, { query: "ana" });
    expect(directorySummary({ loading: false, visible: one, loaded: players, filtersActive: true })).toBe("1 player matches · 3 in directory");
    expect(directorySummary({ loading: false, visible: players, loaded: players, filtersActive: false })).toBe("3 players in Tagum City");
  });

  it("says loading instead of a count while the directory loads", () => {
    expect(directorySummary({ loading: true, visible: [], loaded: [], filtersActive: false })).toMatch(/Loading/);
  });
});