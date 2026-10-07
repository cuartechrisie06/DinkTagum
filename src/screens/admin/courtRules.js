// Court admin form <-> courts row conversion and validation. Pure (no React /
// Supabase) so the rules are testable.
import { formatClock, minutesFromTime, SURFACES, timeInputToDb } from "../../utils/courts";

// "*" so columns added by later migrations (surface, opens_at, closes_at) come
// through, and their presence tells the form whether it can save them.
export const COURT_COLUMNS = "*";
export const STATUSES = ["Available", "Full", "Closed"];
export const COURT_PHOTOS_BUCKET = "court-photos";

export const emptyCourt = {
  name: "",
  area: "",
  address: "",
  status: "Available",
  court_count: "1",
  opening_hours: "",
  amenities: "",
  rating: "",
  latitude: "",
  longitude: "",
  contact_name: "",
  contact_phone: "",
  hourly_rate: "",
  schedule_note: "",
  surface: "",
  opens_at: "",
  closes_at: "",
  // photo_urls is now managed as a string[] directly, not a comma-separated string
  photo_urls: [],
};

export function courtToForm(court) {
  const text = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    name: text(court.name),
    area: text(court.area),
    address: text(court.address),
    status: court.status || "Available",
    court_count: text(court.court_count || 1),
    opening_hours: text(court.opening_hours),
    amenities: (court.amenities || []).join(", "),
    rating: text(court.rating),
    latitude: text(court.latitude),
    longitude: text(court.longitude),
    contact_name: text(court.contact_name),
    contact_phone: text(court.contact_phone),
    hourly_rate: text(court.hourly_rate),
    schedule_note: text(court.schedule_note),
    surface: court.surface || "",
    opens_at: minutesFromTime(court.opens_at) === null ? "" : formatClock(minutesFromTime(court.opens_at)),
    closes_at: minutesFromTime(court.closes_at) === null ? "" : formatClock(minutesFromTime(court.closes_at)),
    // Keep as array so the photo manager can work directly with it
    photo_urls: Array.isArray(court.photo_urls) ? court.photo_urls : [],
  };
}

const optNum = (v) => (String(v ?? "").trim() === "" ? null : Number(v));
const optText = (v) => String(v ?? "").trim() || null;

// Every problem with the form at once, keyed by field so each input can show
// its own message. Empty object when the form is valid. Mirrors the courts
// table check constraints.
export function courtFieldErrors(form, { details = true } = {}) {
  const errors = {};
  const name = String(form.name || "").trim();
  const courtCount = Number(form.court_count);
  const rating = optNum(form.rating);
  const latitude = optNum(form.latitude);
  const longitude = optNum(form.longitude);
  const hourlyRate = optNum(form.hourly_rate);
  const phone = optText(form.contact_phone);

  if (!name) errors.name = "Enter the court's name.";
  else if (name.length > 120) errors.name = "Keep the name under 120 characters.";
  if (!STATUSES.includes(form.status)) errors.status = "Choose a valid status.";
  if (!Number.isInteger(courtCount) || courtCount < 1) errors.court_count = "Whole number, at least 1.";
  if (rating !== null && !(rating >= 0 && rating <= 5)) errors.rating = "Rating must be between 0 and 5.";
  if (latitude !== null && !(latitude >= -90 && latitude <= 90)) errors.latitude = "Must be a number from −90 to 90.";
  if (longitude !== null && !(longitude >= -180 && longitude <= 180)) errors.longitude = "Must be a number from −180 to 180.";
  if ((latitude === null) !== (longitude === null)) errors[latitude === null ? "latitude" : "longitude"] = "Set both latitude and longitude, or leave both blank.";
  if (hourlyRate !== null && !(hourlyRate >= 0)) errors.hourly_rate = "Enter a price of 0 or more.";
  if (phone && !/^\+?[\d\s()-]{7,20}$/.test(phone)) errors.contact_phone = "Use digits only, e.g. +63 912 345 6789.";
  if ((form.photo_urls || []).some((u) => typeof u === "string" && u.trim() && !/^https?:\/\//i.test(u))) errors.photo_urls = "All photo URLs must start with https://.";

  if (details) {
    const opens = timeInputToDb(form.opens_at);
    const closes = timeInputToDb(form.closes_at);
    if (opens.error) errors.opens_at = "Use a time like 6:00 AM or 18:00.";
    if (closes.error) errors.closes_at = "Use a time like 10:00 PM or 22:00.";
    if (!opens.error && !closes.error && (opens.value === null) !== (closes.value === null)) {
      errors[opens.value === null ? "opens_at" : "closes_at"] = "Set both opening and closing times, or leave both blank.";
    }
  }
  return errors;
}

// Converts the text form into a courts DB row. `details`: the database has the
// surface / opens_at / closes_at columns (court details migration applied);
// otherwise they're left out of the row. Returns { value } or { error, errors }.
export function courtFormToRow(form, { details = true } = {}) {
  const errors = courtFieldErrors(form, { details });
  const first = Object.values(errors)[0];
  if (first) return { error: first, errors };

  const row = {
    name: form.name.trim(),
    area: optText(form.area),
    address: optText(form.address),
    status: form.status,
    court_count: Number(form.court_count),
    opening_hours: optText(form.opening_hours),
    amenities: form.amenities
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean),
    rating: optNum(form.rating),
    latitude: optNum(form.latitude),
    longitude: optNum(form.longitude),
    contact_name: optText(form.contact_name),
    contact_phone: optText(form.contact_phone),
    hourly_rate: optNum(form.hourly_rate),
    schedule_note: optText(form.schedule_note),
    photo_urls: (form.photo_urls || []).filter((u) => typeof u === "string" && u.trim()),
  };

  if (details) {
    row.opens_at = timeInputToDb(form.opens_at).value;
    row.closes_at = timeInputToDb(form.closes_at).value;
    row.surface = SURFACES.includes(form.surface) ? form.surface : null;
  }

  return { value: row };
}
