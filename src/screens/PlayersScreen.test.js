jest.mock("../../lib/supabase", () => ({ supabase: null }));
const { filterPlayers } = require("./PlayersScreen");

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
