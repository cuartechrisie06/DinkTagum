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
