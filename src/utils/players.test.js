import { connectionLabel, filterByDistance, playerDistanceKm, recentOpponents } from "./players";

const courtsById = {
  near: { id: "near", latitude: 7.4478, longitude: 125.8083 },
  far: { id: "far", latitude: 7.55, longitude: 125.8083 }, // ~11 km north
};
const origin = { latitude: 7.448, longitude: 125.809 };
const players = [
  { id: "a", home_court_id: "near" },
  { id: "b", home_court_id: "far" },
  { id: "c", home_court_id: null },
];

describe("distance filter", () => {
  it("measures from me to the player's home court", () => {
    expect(playerDistanceKm(players[0], origin, courtsById)).toBeLessThan(1);
    expect(playerDistanceKm(players[1], origin, courtsById)).toBeGreaterThan(10);
    expect(playerDistanceKm(players[2], origin, courtsById)).toBeNull();
  });

  it("keeps players within the chosen distance and drops unknowns", () => {
    expect(filterByDistance(players, { km: 5, origin, courtsById }).map((p) => p.id)).toEqual(["a"]);
    expect(filterByDistance(players, { km: 20, origin, courtsById }).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("doesn't filter when no distance is chosen or my location is unknown", () => {
    expect(filterByDistance(players, { km: null, origin, courtsById })).toHaveLength(3);
    expect(filterByDistance(players, { km: 5, origin: null, courtsById })).toHaveLength(3);
  });
});

describe("recentOpponents", () => {
  it("lists distinct tagged opponents, most recent first", () => {
    const records = [
      { opponent_id: "u2", opponents: "Ben", played_on: "2026-10-01", result: "win" },
      { opponent_id: null, opponents: "Walk-in", played_on: "2026-10-05", result: "loss" },
      { opponent_id: "u3", opponents: "Cara", played_on: "2026-10-04", result: "loss" },
      { opponent_id: "u2", opponents: "Ben", played_on: "2026-10-06", result: "win" },
    ];
    expect(recentOpponents(records)).toEqual([
      { id: "u2", name: "Ben", lastPlayed: "2026-10-06", result: "win" },
      { id: "u3", name: "Cara", lastPlayed: "2026-10-04", result: "loss" },
    ]);
    expect(recentOpponents(records, 1)).toHaveLength(1);
  });
});

describe("connectionLabel", () => {
  it("shows Pending right after I tap Connect", () => {
    expect(connectionLabel(null)).toBe("Connect");
    expect(connectionLabel({ status: "pending", requesterIsMe: true })).toBe("Pending");
    expect(connectionLabel({ status: "pending", requesterIsMe: false })).toBe("Accept");
    expect(connectionLabel({ status: "accepted" })).toBe("Connected");
  });
});
