// Player directory helpers: distance filtering via home courts and the
// "Recently played with" list. Pure, so they're testable.
import { haversineKm } from "./courts";

export const DISTANCE_FILTERS = [
  { key: "any", label: "Any distance", km: null },
  { key: "2", label: "Within 2 km", km: 2 },
  { key: "5", label: "Within 5 km", km: 5 },
  { key: "10", label: "Within 10 km", km: 10 },
];

function hasCoords(point) {
  return Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude);
}

// Where a player plays from: their home court's coordinates, if set.
export function playerPoint(player, courtsById) {
  const court = player.home_court_id ? courtsById[player.home_court_id] : null;
  return hasCoords(court) ? { latitude: court.latitude, longitude: court.longitude } : null;
}

// km between me (my location, else my home court) and the player's home court;
// null when either side is unknown.
export function playerDistanceKm(player, origin, courtsById) {
  const point = playerPoint(player, courtsById);
  if (!point || !hasCoords(origin)) return null;
  return haversineKm(origin, point);
}

// Keeps players within `km`. Players without a home court are left out once a
// distance is chosen (we can't tell how far they are).
export function filterByDistance(players, { km, origin, courtsById }) {
  if (km === null || km === undefined) return players;
  if (!hasCoords(origin)) return players;
  return players.filter((p) => {
    const d = playerDistanceKm(p, origin, courtsById);
    return d !== null && d <= km;
  });
}

// Distinct registered opponents from my match records, most recent first.
// Only tagged matches (opponent_id) link to a real player.
export function recentOpponents(records, limit = 5) {
  const seen = new Map();
  const sorted = [...records].sort((a, b) => (a.played_on < b.played_on ? 1 : a.played_on > b.played_on ? -1 : 0));
  for (const record of sorted) {
    if (!record.opponent_id || seen.has(record.opponent_id)) continue;
    seen.set(record.opponent_id, { id: record.opponent_id, name: record.opponents, lastPlayed: record.played_on, result: record.result });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

// Button text for a connection: "Pending" right after tapping Connect.
export function connectionLabel(state) {
  if (!state) return "Connect";
  if (state.status === "accepted") return "Connected";
  return state.requesterIsMe ? "Pending" : "Accept";
}
