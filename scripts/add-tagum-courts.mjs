// Adds the Tagum City courts from PICKLEBALL_LOCATION.docx that weren't in the
// app yet, with their photos. Safe to re-run: a court whose name already
// exists is skipped, and photos are only attached to courts that have none.
//
// Needs the service role key (it bypasses RLS, like seed-test-data.mjs):
//   node --env-file=.env.local --env-file=.env.seed.local scripts/add-tagum-courts.mjs
// Add --dry-run to print what would change without writing anything.
//
// Coordinates come from OpenStreetMap (Nominatim) lookups of each address.
// Where only the barangay could be found, the pin is approximate and the
// court's schedule note says so; adjust it in Admin when you know the spot.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const PHOTO_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "court-photos");
const BUCKET = "court-photos";
const APPROXIMATE = "Map pin is approximate (barangay center). Ask the venue for exact directions.";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || /paste-your|your-service-role-key/.test(SERVICE_ROLE_KEY)) {
  console.error("Add your service role key to .env.seed.local (SUPABASE_SERVICE_ROLE_KEY=...).");
  console.error("Find it in Supabase Dashboard > Project Settings > API > service_role.");
  process.exit(1);
}

const COURTS = [
  {
    name: "Spin & Smash Pickleball Pavilion", area: "Visayan Village", address: "Visayan Village, Tagum City",
    latitude: 7.431843, longitude: 125.803791, surface: "Indoor", court_count: 2,
    amenities: ["Indoor", "Lights", "Parking"], schedule_note: APPROXIMATE,
    photos: ["spin-and-smash-1.jpg", "spin-and-smash-2.jpg"],
  },
  {
    name: "Pickle City", area: "Mankilam", address: "Purok Galingan, Mankilam, Tagum City",
    latitude: 7.4607703, longitude: 125.7848619, surface: "Indoor", court_count: 2,
    amenities: ["Indoor", "Lights", "Seating area"], schedule_note: APPROXIMATE,
    photos: ["pickle-city.jpg"],
  },
  {
    // Street-level pin (Estrella St.).
    name: "The Pinkle Zone", area: "Mankilam", address: "Estrella St., fronting SK Gas Station, Mankilam, Tagum City",
    latitude: 7.4572099, longitude: 125.7963505, surface: null, court_count: 1,
    amenities: [], schedule_note: null,
    photos: ["pinkle-zone.jpg"],
  },
  {
    // Pinned at Wilcon Depot Tagum; the venue is directly in front of it.
    // Hours from the shop sign; the weekend hours differ, so they stay as text.
    name: "Play & Sip Pickleball Coffee", area: "Canocotan", address: "Tiongko Village, Canocotan, Tagum City (in front of Wilcon)",
    latitude: 7.4105826, longitude: 125.7788736, surface: null, court_count: 1,
    opening_hours: "Mon–Fri 3:00 PM – 12:00 AM · Sat–Sun 12:00 PM – 12:00 AM",
    amenities: ["Coffee shop", "Lights"], schedule_note: "Café on site. Weekends open from 12:00 PM.",
    photos: ["play-and-sip.jpg"],
  },
  {
    // Street-level pin (Mabini St.). Hours from the venue's "We're open" post.
    name: "Paddle Point Pickleball", area: "Magugpo Poblacion", address: "Mabini St., Tagum City",
    latitude: 7.4474073, longitude: 125.8027812, surface: "Indoor", court_count: 3,
    opening_hours: "8:00 AM – 11:00 PM daily", opens_at: "08:00", closes_at: "23:00",
    amenities: ["Indoor", "Lights", "Seating area"], schedule_note: null,
    photos: ["paddle-point.jpg"],
  },
  {
    // Neighbourhood-level pin (Purok Caimito).
    name: "The Palm Court", area: "Mankilam", address: "Purok Caimito, Mankilam, Tagum City",
    latitude: 7.4655868, longitude: 125.7925551, surface: "Indoor", court_count: 2,
    amenities: ["Indoor", "Lights"], schedule_note: null,
    photos: ["palm-court.jpg"],
  },
  {
    name: "PBC Pickle Ball Corner", area: "La Filipina", address: "P-3 La Filipina, Tagum City",
    latitude: 7.4764565, longitude: 125.8053029, surface: null, court_count: 1,
    amenities: ["Indoor", "Outdoor", "Open play"],
    schedule_note: `Indoor and outdoor courts; book via facebook.com/pickleballcorner. ${APPROXIMATE}`,
    photos: ["pickle-ball-corner.jpg"],
  },
  {
    name: "Court Uno Pickleball Club", area: "San Miguel", address: "Prk 6, Campo 4, Brgy. San Miguel, Tagum City",
    latitude: 7.4422203, longitude: 125.7761364, surface: "Covered", court_count: 1,
    amenities: ["Covered", "Lights"], schedule_note: `Single private court. ${APPROXIMATE}`,
    photos: ["court-uno.jpg"],
  },
  {
    // Neighbourhood-level pin (Mangga, Visayan Village).
    name: "Dinker's Hide", area: "Visayan Village", address: "Prk. Pag-asa, Mangga, Visayan Village, Tagum City",
    latitude: 7.4357384, longitude: 125.8143648, surface: "Outdoor", court_count: 1,
    amenities: ["Outdoor", "Lights"], schedule_note: null,
    photos: ["dinkers-hide.jpg"],
  },
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function uploadPhotos(court) {
  const urls = [];
  for (const [index, file] of court.photos.entries()) {
    const bytes = await readFile(path.join(PHOTO_DIR, file));
    const objectPath = `venues/${slug(court.name)}-${index + 1}.jpg`;
    const { error } = await admin.storage.from(BUCKET).upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`Uploading ${file}: ${error.message}`);
    urls.push(admin.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl);
  }
  return urls;
}

const { data: existing, error: listError } = await admin.from("courts").select("id, name, photo_urls").limit(1000);
if (listError) { console.error(`Could not read courts: ${listError.message}`); process.exit(1); }
const byName = new Map(existing.map((court) => [normalize(court.name), court]));

for (const court of COURTS) {
  const { photos, ...row } = court;
  const match = byName.get(normalize(court.name));
  if (match && match.photo_urls?.length) { console.log(`skip  ${court.name} (already listed)`); continue; }
  if (DRY_RUN) { console.log(`${match ? "photo" : "add  "} ${court.name} (${photos.length} photo${photos.length === 1 ? "" : "s"})`); continue; }

  const photo_urls = await uploadPhotos(court);
  if (match) {
    const { error } = await admin.from("courts").update({ photo_urls }).eq("id", match.id);
    if (error) throw new Error(`Updating ${court.name}: ${error.message}`);
    console.log(`photo ${court.name}`);
  } else {
    const { error } = await admin.from("courts").insert({ status: "Available", ...row, photo_urls });
    if (error) throw new Error(`Adding ${court.name}: ${error.message}`);
    console.log(`added ${court.name}`);
  }
}
console.log(DRY_RUN ? "Dry run only; nothing was written." : "Done.");
