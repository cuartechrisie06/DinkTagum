// Simple profile badges earned from logged matches and profile setup.
// Pure: input is the player's match records (newest first, as stored) plus a
// couple of profile facts.
import { calculateProfileStats } from "./profileStats";

export const BADGES = [
  { key: "first_match", label: "First match", icon: "flag", hint: "Log your first match", earned: ({ stats }) => stats.matchesPlayed >= 1 },
  { key: "regular", label: "Regular", icon: "calendar", hint: "Log 10 matches", earned: ({ stats }) => stats.matchesPlayed >= 10 },
  { key: "first_win", label: "First win", icon: "trophy", hint: "Win a match", earned: ({ stats }) => stats.wins >= 1 },
  { key: "on_fire", label: "On fire", icon: "flame", hint: "Win 3 in a row", earned: ({ stats }) => stats.streak?.result === "win" && stats.streak.count >= 3 },
  { key: "sharpshooter", label: "Sharpshooter", icon: "ribbon", hint: "60%+ wins over 5+ matches", earned: ({ stats }) => stats.matchesPlayed >= 5 && stats.winRate >= 60 },
  { key: "verified", label: "Verified", icon: "shield-checkmark", hint: "Get a match confirmed by your opponent", earned: ({ records }) => records.some((r) => r.confirmation_status === "confirmed") },
  { key: "local", label: "Local", icon: "home", hint: "Set your home court", earned: ({ homeCourtId }) => Boolean(homeCourtId) },
];

// Every badge with `earned: true | false`, earned ones first (in list order).
export function computeBadges(records, { homeCourtId = null } = {}) {
  const stats = calculateProfileStats(records);
  const all = BADGES.map(({ earned, ...badge }) => ({ ...badge, earned: Boolean(earned({ stats, records, homeCourtId })) }));
  return [...all.filter((b) => b.earned), ...all.filter((b) => !b.earned)];
}
