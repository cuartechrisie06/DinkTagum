// Booking selection, pricing and follow-up helpers for the court page.
// Pure where possible so the rules are testable.
import { BOOKING_SLOTS } from "./courts";
import { parseSlotLabel, slotHasStarted, slotOverlapsBusy } from "./slots";

export const MAX_BOOKING_HOURS = 4;

// Start Date for a "4:00 PM" slot on a given day.
export function slotStart(dayDate, label) {
  const { hour, minute } = parseSlotLabel(label);
  const start = new Date(dayDate);
  start.setHours(hour, minute, 0, 0);
  return start;
}

// The slot labels covered by a selection, e.g. 4:00 PM × 2 -> [4 PM, 5 PM].
export function selectionSlots(selection) {
  if (!selection) return [];
  const startIndex = BOOKING_SLOTS.indexOf(selection.start);
  return BOOKING_SLOTS.slice(startIndex, startIndex + selection.hours);
}

function isFree(dayDate, label, busy, now) {
  return !slotHasStarted(dayDate, label, now) && !slotOverlapsBusy(dayDate, label, busy);
}

// Consecutive slots are exactly one hour apart (8 AM -> 3 PM is a gap).
function isNextHour(a, b) {
  return parseSlotLabel(b).hour === parseSlotLabel(a).hour + 1;
}

export function selectionAvailable(dayDate, selection, busy, now = Date.now()) {
  const slots = selectionSlots(selection);
  return slots.length === selection?.hours && slots.every((label) => isFree(dayDate, label, busy, now));
}

// Tapping a slot: the slot right after the selection extends it, a slot
// inside it trims the end back to that slot, anything else starts over.
export function toggleSlot(selection, label, dayDate, busy, now = Date.now()) {
  if (!isFree(dayDate, label, busy, now)) return selection;
  const slots = selectionSlots(selection);
  const last = slots[slots.length - 1];
  if (selection && last && isNextHour(last, label) && selection.hours < MAX_BOOKING_HOURS) {
    return { start: selection.start, hours: selection.hours + 1 };
  }
  const inside = slots.indexOf(label);
  if (selection && inside > 0) return { start: selection.start, hours: inside + 1 };
  return { start: label, hours: 1 };
}

// "4:00 – 6:00 PM" / "11:00 AM – 1:00 PM".
export function timeRangeLabel(dayDate, selection) {
  const start = slotStart(dayDate, selection.start);
  const end = new Date(start.getTime() + selection.hours * 3600 * 1000);
  const fmt = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function bookingPrice(hourlyRate, hours) {
  if (hourlyRate === null || hourlyRate === undefined || !Number.isFinite(Number(hourlyRate))) return null;
  return { perHour: Number(hourlyRate), hours, total: Number(hourlyRate) * hours };
}

export function peso(amount) {
  return `₱${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// First free slot across the given days. `busyFor(day)` returns that day's
// busy ranges (may be async). Returns { day, label } or null.
export async function findNextAvailable(days, busyFor, now = Date.now()) {
  for (const day of days) {
    const busy = await busyFor(day);
    const label = BOOKING_SLOTS.find((slot) => isFree(day.date, slot, busy, now));
    if (label) return { day, label };
  }
  return null;
}

// Prefilled "Add to Google Calendar" link. Works on every platform with no
// permission or native module (expo-calendar needs a development build).
export function googleCalendarUrl({ title, details, location, start, end }) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${stamp(start)}/${stamp(end)}`, details: details || "", location: location || "" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// When to remind: an hour before, or 15 minutes before if that's already past.
export function reminderTime(start, now = Date.now()) {
  const hourBefore = start.getTime() - 3600 * 1000;
  if (hourBefore > now) return new Date(hourBefore);
  const quarterBefore = start.getTime() - 15 * 60 * 1000;
  return quarterBefore > now ? new Date(quarterBefore) : null;
}
