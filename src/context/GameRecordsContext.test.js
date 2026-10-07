import { canEditRecord, confirmationBadge, gameRecordFieldErrors, sortRecords, validateGameRecord } from "./GameRecordsContext";

const valid = { played_on: "2026-01-15", opponents: "  Ana & Ben ", player_score: "11", opponent_score: "7" };

describe("validateGameRecord", () => {
  it("normalizes a valid record", () => {
    expect(validateGameRecord(valid)).toEqual({ value: { played_on: "2026-01-15", opponents: "Ana & Ben", player_score: 11, opponent_score: 7, opponent_id: null } });
  });

  it("keeps a tagged opponent", () => {
    expect(validateGameRecord({ ...valid, opponent_id: "u2" }).value.opponent_id).toBe("u2");
  });

  it("requires an opponent", () => {
    expect(validateGameRecord({ ...valid, opponents: "  " }).error).toMatch(/who you played/);
  });

  it("rejects ties, out-of-range and fractional scores", () => {
    expect(validateGameRecord({ ...valid, opponent_score: "11" }).error).toMatch(/tie/);
    expect(validateGameRecord({ ...valid, player_score: "100" }).error).toMatch(/0 to 99/);
    expect(validateGameRecord({ ...valid, player_score: "10.5" }).error).toMatch(/0 to 99/);
    expect(validateGameRecord({ ...valid, player_score: "" }).error).toMatch(/your score/);
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

describe("match confirmation display", () => {
  it("badges tagged matches and nothing for untagged ones", () => {
    expect(confirmationBadge({ confirmation_status: "confirmed" }).label).toBe("Verified");
    expect(confirmationBadge({ confirmation_status: "pending" }).label).toMatch(/Awaiting/);
    expect(confirmationBadge({ confirmation_status: "disputed" }).label).toMatch(/Disputed/);
    expect(confirmationBadge({ confirmation_status: "unverified" })).toBeNull();
    expect(confirmationBadge({})).toBeNull();
  });

  it("locks confirmed matches", () => {
    expect(canEditRecord({ confirmation_status: "confirmed" })).toBe(false);
    expect(canEditRecord({ confirmation_status: "disputed" })).toBe(true);
    expect(canEditRecord({})).toBe(true);
  });
});

describe("gameRecordFieldErrors", () => {
  it("puts each message under the field it belongs to", () => {
    const errors = gameRecordFieldErrors({ played_on: "2999-01-01", opponents: "", player_score: "", opponent_score: "120" });
    expect(errors).toEqual({
      opponents: expect.stringMatching(/who you played/),
      played_on: expect.stringMatching(/future/),
      player_score: expect.stringMatching(/your score/),
      opponent_score: expect.stringMatching(/0 to 99/),
    });
  });

  it("flags a tie on the opponent score", () => {
    expect(gameRecordFieldErrors({ played_on: "2026-01-15", opponents: "Ana", player_score: "9", opponent_score: "9" })).toEqual({ opponent_score: expect.stringMatching(/tie/) });
  });
});
