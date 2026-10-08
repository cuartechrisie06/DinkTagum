import { computeBadges } from "./badges";

const game = (result, extra = {}) => ({ result, player_score: result === "win" ? 11 : 5, opponent_score: result === "win" ? 5 : 11, ...extra });
const earned = (records, opts) => computeBadges(records, opts).filter((b) => b.earned).map((b) => b.key);

describe("computeBadges", () => {
  it("earns nothing without matches or a home court", () => {
    expect(earned([])).toEqual([]);
    expect(computeBadges([])).toHaveLength(7);
  });

  it("awards match badges from the record", () => {
    expect(earned([game("win"), game("win"), game("win")])).toEqual(["first_match", "first_win", "on_fire"]);
    expect(earned([game("loss")])).toEqual(["first_match"]);
  });

  it("needs five matches for Sharpshooter and ten for Regular", () => {
    const fiveWins = Array.from({ length: 5 }, () => game("win"));
    expect(earned(fiveWins)).toContain("sharpshooter");
    expect(earned(fiveWins)).not.toContain("regular");
    expect(earned(Array.from({ length: 10 }, () => game("loss")))).toContain("regular");
  });

  it("counts confirmed matches and a home court", () => {
    expect(earned([game("loss", { confirmation_status: "confirmed" })], { homeCourtId: "c1" })).toEqual(["first_match", "verified", "local"]);
  });

  it("lists earned badges first", () => {
    const list = computeBadges([game("win")]);
    expect(list.slice(0, 2).every((b) => b.earned)).toBe(true);
    expect(list[list.length - 1].earned).toBe(false);
  });
});
