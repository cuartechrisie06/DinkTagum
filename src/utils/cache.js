// Small per-user offline cache on top of AsyncStorage. The app shows the last
// data it saw while fresh data loads, and keeps showing it when offline.
// Every call swallows storage errors: a cache miss must never break the app.
import AsyncStorage from "@react-native-async-storage/async-storage";

// Bump when the cached shape changes so old entries are ignored.
const VERSION = 1;

export function cacheKey(name, userId) {
  return `dinktagum:v${VERSION}:${userId}:${name}`;
}

// Returns { data, savedAt } or null when there's nothing usable.
export async function readCache(name, userId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(name, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.savedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeCache(name, userId, data, now = Date.now()) {
  try {
    await AsyncStorage.setItem(cacheKey(name, userId), JSON.stringify({ data, savedAt: now }));
  } catch {
    // Storage full or unavailable: the app still works, just without the cache.
  }
}

// "just now", "5 min ago", "3 h ago", "2 days ago".
export function savedAgoLabel(savedAt, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - savedAt) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
