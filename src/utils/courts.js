// Court presentation logic shared by cards, the map, sorting and filters.
// Pure functions (no React / Supabase) so they're easy to test.
import { slotHasStarted, slotOverlapsBusy } from "./slots";

// Bookable one-hour slots offered on every court page.
export const BOOKING_SLOTS = ["6:00 AM", "7:00 AM", "8:00 AM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"];

export const SURFACES = ["Indoor", "Outdoor", "Covered"];

export const SORTS = [
  { key: "nearest", label: "Nearest", icon: "navigate-outline" },
  { key: "rating", label: "Top rated", icon: "star-outline" },
  { key: "cheapest", label: "Cheapest", icon: "cash-outline" },
  { key: "available", label: "Available now", icon: "flash-outline" },
];

export const PRICE_CAPS = [null, 100, 150, 200, 300];

export const DEFAULT_FILTERS = { surface: null, maxPrice: null, lighting: false, openNow: false, favoritesOnly: false, amenities: [] };

// "06:00", "06:00:00" (Postgres time) -> minutes after midnight.
export function minutesFromTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 24 * 60 ? minutes : null;
}

// Pulls opening and closing times out of free text such as
// "6:00 AM – 10:00 PM daily", "5AM-9PM" or "06:00 - 22:00".
export function parseHoursText(text) {
  const source = String(text || "");
  const twelveHour = [...source.matchAll(/(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?/g)].map((m) => {
    const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0);
    return hour * 60 + Number(m[2] || 0);
  });
  const times = twelveHour.length >= 2
    ? twelveHour
    : [...source.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  if (times.length < 2 || times.some((t) => t > 24 * 60)) return null;
  return { open: times[0], close: times[1] };
}

// Structured opens_at/closes_at win; the free-text hours are the fallback.
export function courtHours(court) {
  const open = minutesFromTime(court.opensAt);
  const close = minutesFromTime(court.closesAt);
  if (open !== null && close !== null) return { open, close };
  return parseHoursText(court.hours);
}

// 360 -> "6 AM", 1290 -> "9:30 PM".
export function formatClock(minutes) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const hour = hour24 % 12 || 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour24 < 12 ? "AM" : "PM"}`;
}

// Whether the court is open right now, and a short label for cards.
// status "Closed" is an admin decision (e.g. renovation), so it wins over hours.
export function openState(court, now = Date.now()) {
  if (court.status === "Closed") return { open: false, known: true, temporary: true, label: "Temporarily closed" };
  const hours = courtHours(court);
  if (!hours) return { open: null, known: false, label: null };
  const date = new Date(now);
  const current = date.getHours() * 60 + date.getMinutes();
  const { open, close } = hours;
  const overnight = close <= open;
  const isOpen = overnight ? current >= open || current < close : current >= open && current < close;
  if (isOpen) return { open: true, known: true, label: `Open until ${formatClock(close)}` };
  return { open: false, known: true, label: current < open ? `Opens ${formatClock(open)}` : `Opens tomorrow ${formatClock(open)}` };
}

// First bookable slot today or tomorrow, mirroring the court page's rules
// (not started, not overlapping a reservation). Null when nothing is free
// or the court isn't taking bookings.
export function nextOpenSlot(court, busyRanges, now = Date.now()) {
  if (court.status !== "Available" || !busyRanges) return null;
  for (let offset = 0; offset < 2; offset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    const slot = BOOKING_SLOTS.find((s) => !slotHasStarted(day, s, now) && !slotOverlapsBusy(day, s, busyRanges));
    if (slot) return { label: offset === 0 ? slot : `Tomorrow ${slot}`, today: offset === 0, order: offset * 10000 + BOOKING_SLOTS.indexOf(slot) };
  }
  return null;
}

export function surfaceFor(court) {
  if (SURFACES.includes(court.surface)) return court.surface;
  const amenities = (court.amenities || []).map((a) => a.toLowerCase());
  if (amenities.some((a) => a.includes("indoor"))) return "Indoor";
  if (amenities.some((a) => a.includes("covered"))) return "Covered";
  if (amenities.some((a) => a.includes("outdoor"))) return "Outdoor";
  return null;
}

export function hasLighting(court) {
  return (court.amenities || []).some((a) => /light/i.test(a));
}

export function distanceKm(court) {
  const value = Number.parseFloat(court.dist);
  return Number.isFinite(value) ? value : null;
}

// Adds the derived fields every court view needs.
export function enrichCourt(court, { busyByCourt, favoriteIds, now = Date.now() } = {}) {
  return {
    ...court,
    surface: surfaceFor(court),
    lighting: hasLighting(court),
    openInfo: openState(court, now),
    nextSlot: busyByCourt ? nextOpenSlot(court, busyByCourt[court.id] || [], now) : null,
    isFavorite: Boolean(favoriteIds?.has(court.id)),
  };
}

export function filterCourts(courts, filters) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  return courts.filter((c) => {
    if (f.surface && c.surface !== f.surface) return false;
    if (f.maxPrice !== null && !(c.hourlyRate !== null && c.hourlyRate !== undefined && c.hourlyRate <= f.maxPrice)) return false;
    if (f.lighting && !c.lighting) return false;
    if (f.openNow && c.openInfo?.open !== true) return false;
    if (f.favoritesOnly && !c.isFavorite) return false;
    if (f.amenities.length && !f.amenities.every((a) => (c.amenities || []).includes(a))) return false;
    return true;
  });
}

export function activeFilterCount(filters) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  return [f.surface, f.maxPrice !== null, f.lighting, f.openNow, f.favoritesOnly].filter(Boolean).length + f.amenities.length;
}

const byName = (a, b) => a.name.localeCompare(b.name);
const nullsLast = (value) => (value === null || value === undefined ? Number.POSITIVE_INFINITY : value);

// "available": bookable courts that are open now first, soonest slot first.
function availabilityRank(c) {
  if (c.status !== "Available") return 3;
  if (c.nextSlot?.today && c.openInfo?.open !== false) return 0;
  if (c.nextSlot) return 1;
  return 2;
}

export function sortCourts(courts, sortKey) {
  const list = courts.slice();
  if (sortKey === "nearest") return list.sort((a, b) => nullsLast(distanceKm(a)) - nullsLast(distanceKm(b)) || byName(a, b));
  if (sortKey === "rating") return list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0) || byName(a, b));
  if (sortKey === "cheapest") return list.sort((a, b) => nullsLast(a.hourlyRate) - nullsLast(b.hourlyRate) || byName(a, b));
  if (sortKey === "available") return list.sort((a, b) => availabilityRank(a) - availabilityRank(b) || nullsLast(a.nextSlot?.order) - nullsLast(b.nextSlot?.order) || byName(a, b));
  return list.sort(byName);
}

// Every amenity present in the data, minus lighting and surface words
// (each has its own filter).
export function amenityOptions(courts) {
  return [...new Set(courts.flatMap((c) => c.amenities || []))].filter((a) => !/light|indoor|outdoor|covered/i.test(a)).sort();
}

// Admin form: "6:00 AM" / "18:30" -> "06:00" for a Postgres time column.
export function timeInputToDb(value) {
  const text = String(value || "").trim();
  if (!text) return { value: null };
  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/.exec(text);
  const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(text);
  let hour;
  let minute;
  if (twelve) { hour = (Number(twelve[1]) % 12) + (twelve[3].toUpperCase() === "P" ? 12 : 0); minute = Number(twelve[2] || 0); if (Number(twelve[1]) > 12) return { error: true }; }
  else if (twentyFour) { hour = Number(twentyFour[1]); minute = Number(twentyFour[2]); }
  else return { error: true };
  if (hour > 23 || minute > 59) return { error: true };
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

// Straight-line km between two { latitude, longitude } points.
export function haversineKm(from, to) {
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(to.latitude - from.latitude);
  const dLng = rad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fallback when the player's location is unknown: distance from Tagum City
// center (the city hall area), labeled as such.
export const TAGUM_CENTER = { latitude: 7.4478, longitude: 125.8083 };
export function distanceFromCenterLabel(court) {
  if (!Number.isFinite(court.latitude) || !Number.isFinite(court.longitude)) return null;
  return `${haversineKm(TAGUM_CENTER, court).toFixed(1)} km from city center`;
}

// "4.8", or "New" for courts that haven't been rated yet (rating 0 / null).
export function ratingLabel(court) {
  const rating = Number(court.rating || 0);
  return rating > 0 ? rating.toFixed(1) : "New";
}

// Courts worth suggesting when a player has nothing booked: ones with a free
// slot today first (soonest first), then tomorrow, nearest breaking ties.
export function suggestCourts(courts, limit = 3) {
  return sortCourts(courts.filter((c) => c.status === "Available" && c.nextSlot), "available")
    .sort((a, b) => Number(Boolean(b.nextSlot?.today)) - Number(Boolean(a.nextSlot?.today)) || (a.nextSlot?.order ?? 0) - (b.nextSlot?.order ?? 0) || nullsLast(distanceKm(a)) - nullsLast(distanceKm(b)))
    .slice(0, limit);
}

// "Free 4:00 PM · ₱150/hr" for a suggestion row.
export function suggestionLabel(court) {
  const slot = court.nextSlot ? `Free ${court.nextSlot.label}` : "Check availability";
  const price = court.hourlyRate !== null && court.hourlyRate !== undefined ? ` · ₱${Number(court.hourlyRate)}/hr` : "";
  const dist = distanceKm(court) !== null ? ` · ${distanceKm(court)} km` : "";
  return `${slot}${price}${dist}`;
}
