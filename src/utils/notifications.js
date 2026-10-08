// Notification list helpers (pure, so they're testable).

// Older reservations each created an identical "Reservation received" row with
// no link to the booking, so the list showed the same item over and over.
// Rows with the same kind, title, body and related item collapse into the
// newest one; `ids` keeps every collapsed id so marking it read clears them all.
// Input is newest first (as queried); order is preserved.
export function dedupeNotifications(notifications) {
  const byKey = new Map();
  const result = [];
  for (const item of notifications) {
    const key = [item.kind, item.title, item.body || "", item.related_id || ""].join("|");
    const kept = byKey.get(key);
    if (kept) {
      kept.ids.push(item.id);
      kept.duplicates += 1;
      if (!item.is_read) kept.is_read = false;
      continue;
    }
    const entry = { ...item, ids: [item.id], duplicates: 0 };
    byKey.set(key, entry);
    result.push(entry);
  }
  return result;
}

// Notification kinds bucketed for the "By type" view.
export const NOTIFICATION_GROUPS = [
  { key: "bookings", title: "Bookings", kinds: ["reservation"] },
  { key: "games", title: "Games & matches", kinds: ["open_play", "game_invitation", "match"] },
  { key: "messages", title: "Messages", kinds: ["message"] },
  { key: "social", title: "Community & connections", kinds: ["community", "connection"] },
  { key: "other", title: "Other", kinds: [] },
];

function groupFor(kind) {
  return NOTIFICATION_GROUPS.find((g) => g.kinds.includes(kind)) || NOTIFICATION_GROUPS[NOTIFICATION_GROUPS.length - 1];
}

// SectionList sections by type, in NOTIFICATION_GROUPS order, skipping empty
// groups. Each title carries its unread count.
export function groupByType(notifications) {
  const buckets = new Map(NOTIFICATION_GROUPS.map((g) => [g.key, []]));
  for (const n of notifications) buckets.get(groupFor(n.kind).key).push(n);
  return NOTIFICATION_GROUPS
    .map((g) => {
      const data = buckets.get(g.key);
      const unread = data.filter((n) => !n.is_read).length;
      return { key: g.key, title: unread ? `${g.title} · ${unread} new` : g.title, data };
    })
    .filter((section) => section.data.length);
}

// Where tapping a notification goes:
//   { type: "chat", id }           a conversation
//   { type: "court", court }       the court page (booking / open game there)
//   { type: "route", path }        a tab
// Falls back to the kind's tab when the linked item isn't known locally.
export function notificationTarget(notification, { reservations = [], games = [], courtsById = {} } = {}) {
  const { kind, related_id: relatedId } = notification;
  if (kind === "message") return relatedId ? { type: "chat", id: relatedId } : { type: "route", path: "/" };
  if (kind === "reservation" && relatedId) {
    const booking = reservations.find((r) => r.id === relatedId);
    const court = booking && (booking.court || courtsById[booking.court_id]);
    if (court) return { type: "court", court };
  }
  if (kind === "open_play" && relatedId) {
    const game = games.find((g) => g.id === relatedId || g.game_id === relatedId);
    const court = game && courtsById[game.court_id];
    if (court) return { type: "court", court };
  }
  if (kind === "reservation" || kind === "match") return { type: "route", path: "/history" };
  if (kind === "connection" || kind === "game_invitation") return { type: "route", path: "/directory" };
  if (kind === "community") return { type: "route", path: "/feed" };
  return { type: "route", path: "/" };
}
