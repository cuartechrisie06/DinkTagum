import { calculateProfileStats, matchHistoryFromRecords } from "./profileStats";

describe("calculateProfileStats", () => {
  it("returns zeroed-out stats for no games", () => {
    const stats = calculateProfileStats([]);
    expect(stats).toMatchObject({ matchesPlayed: 0, wins: 0, losses: 0, winRate: null, winLossRatio: "—" });
  });

  it("computes wins, losses, points, and win rate", () => {
    const games = [
      { result: "win", player_score: 11, opponent_score: 8 },
      { result: "loss", player_score: 6, opponent_score: 11 },
      { result: "win", player_score: 11, opponent_score: 9 },
    ];
    const stats = calculateProfileStats(games);
    expect(stats.matchesPlayed).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.pointsFor).toBe(28);
    expect(stats.pointsAgainst).toBe(28);
    expect(stats.winRate).toBe(67);
    expect(stats.winLossRatio).toBe("2.00");
  });

  it("reports a perfect record when there are no losses", () => {
    const games = [{ result: "win", player_score: 11, opponent_score: 3 }];
    expect(calculateProfileStats(games).winLossRatio).toBe("Perfect");
  });

  it("does not divide by zero when every game was a loss", () => {
    const games = [{ result: "loss", player_score: 3, opponent_score: 11 }];
    expect(calculateProfileStats(games).winLossRatio).toBe("0.00");
  });
});

describe("matchHistoryFromRecords", () => {
  it("maps and limits game records", () => {
    const games = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      opponents: `Opponent ${i}`,
      player_score: 11,
      opponent_score: i,
      result: "win",
      played_on: "2026-01-01",
    }));
    const history = matchHistoryFromRecords(games, 3);
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({ id: 0, opponent: "Opponent 0", playerScore: 11, opponentScore: 0, result: "win", playedOn: "2026-01-01" });
  });
});

describe("currentStreak", () => {
  const { currentStreak } = require("./profileStats");
  it("counts consecutive results from the newest match", () => {
    expect(currentStreak([{ result: "win" }, { result: "win" }, { result: "loss" }, { result: "win" }])).toEqual({ result: "win", count: 2 });
    expect(currentStreak([{ result: "loss" }])).toEqual({ result: "loss", count: 1 });
  });

  it("is null without games", () => {
    expect(currentStreak([])).toBeNull();
  });
});
