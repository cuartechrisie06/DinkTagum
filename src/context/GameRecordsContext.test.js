import { sortRecords, validateGameRecord } from "./GameRecordsContext";

const valid = { played_on: "2026-01-15", opponents: "  Ana & Ben ", player_score: "11", opponent_score: "7" };

describe("validateGameRecord", () => {
  it("normalizes a valid record", () => {
    expect(validateGameRecord(valid)).toEqual({ value: { played_on: "2026-01-15", opponents: "Ana & Ben", player_score: 11, opponent_score: 7 } });
  });

  it("requires an opponent", () => {
    expect(validateGameRecord({ ...valid, opponents: "  " }).error).toMatch(/who you played/);
  });

  it("rejects ties, out-of-range and fractional scores", () => {
    expect(validateGameRecord({ ...valid, opponent_score: "11" }).error).toMatch(/tie/);
    expect(validateGameRecord({ ...valid, player_score: "100" }).error).toMatch(/0 to 99/);
    expect(validateGameRecord({ ...valid, player_score: "10.5" }).error).toMatch(/0 to 99/);
    expect(validateGameRecord({ ...valid, player_score: "" }).error).toMatch(/both scores/);
  });

  it("rejects malformed and future dates", () => {
    expect(validateGameRecord({ ...valid, played_on: "15/01/2026" }).error).toMatch(/YYYY-MM-DD/);
    expect(validateGameRecord({ ...valid, played_on: "2999-01-01" }).error).toMatch(/future/);
  });
});

describe("sortRecords", () => {
  it("orders newest match first", () => {
    const sorted = sortRecords([{ id: "a", played_on: "2026-01-01" }, { id: "b", played_on: "2026-03-01" }, { id: "c", played_on: "2026-02-01" }]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});
