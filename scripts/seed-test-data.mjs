// Seeds realistic TEST/DEMO data into the DinkTagum Supabase project so the
// app's screens have something to show without touching real user data.
//
// Requires the PROJECT SERVICE ROLE KEY (never the publishable key, and never
// committed or placed in the Expo app) because creating Supabase Auth users
// and bypassing RLS both require it. Run with:
//
//   $env:EXPO_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste from Supabase Dashboard > Project Settings > API>"
//   node scripts/seed-test-data.mjs
//
// Re-running this script is safe: every row it creates is scoped to the six
// fixed @dinktagum.test auth user ids, so each run deletes and recreates only
// those rows before reinserting. Pass --purge to delete the test accounts and
// all their data without recreating anything.
//
// Everything here only touches: auth users with an @dinktagum.test email,
// their profiles, and any courts/reservations/posts/matches/conversations/
// messages owned by those users. No other row in the database is read or
// written except the courts table, which is only ever inserted into (never
// deleted), and only when it is completely empty.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing EXPO_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Set them in your shell first (see the comment at the top of this file), then re-run."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PURGE_ONLY = process.argv.includes("--purge");

// Obviously-fake password for obviously-fake accounts; printed at the end so
// you can actually sign in as one of them to see private data (matches, chat,
// reservations) that RLS would otherwise hide from your own account.
const TEST_PASSWORD = "DinkTagumTest#2026";

const TEST_USERS = [
  { key: "alex", email: "alex.santos@dinktagum.test", display_name: "Alex Santos", skill_level: 1.5, preferred_game_type: "Either" },
  { key: "mia", email: "mia.reyes@dinktagum.test", display_name: "Mia Reyes", skill_level: 2.0, preferred_game_type: "Either" },
  { key: "jordan", email: "jordan.cruz@dinktagum.test", display_name: "Jordan Cruz", skill_level: 3.0, preferred_game_type: "Doubles" },
  { key: "kai", email: "kai.mendoza@dinktagum.test", display_name: "Kai Mendoza", skill_level: 3.5, preferred_game_type: "Either" },
  { key: "sam", email: "sam.garcia@dinktagum.test", display_name: "Sam Garcia", skill_level: 4.5, preferred_game_type: "Singles" },
  { key: "chris", email: "chris.navarro@dinktagum.test", display_name: "Chris Navarro", skill_level: 4.0, preferred_game_type: "Singles" },
];

const TEST_COURTS = [
  { name: "[TEST] Tagum Sports Complex Court", area: "Magugpo Poblacion", address: "[TEST DATA] Purok 1, Magugpo Poblacion, Tagum City", latitude: 7.4477, longitude: 125.8096, status: "Available", court_count: 3, opening_hours: "6:00 AM - 9:00 PM daily", amenities: ["Lighting", "Parking", "Restrooms"], rating: 4.6, contact_name: "DinkTagum Test Desk", contact_phone: "0900-000-0001", hourly_rate: 150, schedule_note: "Peak hours 4-8 PM", photo_urls: ["https://picsum.photos/seed/dinktagum-court-1/900/600", "https://picsum.photos/seed/dinktagum-court-1b/900/600"] },
  { name: "[TEST] Riverside Pickleball Courts", area: "Magugpo East", address: "[TEST DATA] Riverside Drive, Magugpo East, Tagum City", latitude: 7.452, longitude: 125.805, status: "Available", court_count: 2, opening_hours: "5:00 AM - 10:00 PM daily", amenities: ["Lighting", "Water station"], rating: 4.3, contact_name: "DinkTagum Test Desk", contact_phone: "0900-000-0002", hourly_rate: 120, schedule_note: null, photo_urls: ["https://picsum.photos/seed/dinktagum-court-2/900/600"] },
  { name: "[TEST] Apokon Covered Court", area: "Apokon", address: "[TEST DATA] Barangay Apokon, Tagum City", latitude: 7.47, longitude: 125.81, status: "Full", court_count: 1, opening_hours: "6:00 AM - 8:00 PM daily", amenities: ["Covered", "Parking"], rating: 4.0, contact_name: "DinkTagum Test Desk", contact_phone: "0900-000-0003", hourly_rate: null, schedule_note: "Fully booked most weekends", photo_urls: ["https://picsum.photos/seed/dinktagum-court-3/900/600"] },
  { name: "[TEST] Magugpo West Community Court", area: "Magugpo West", address: "[TEST DATA] Magugpo West, Tagum City", latitude: 7.445, longitude: 125.795, status: "Closed", court_count: 1, opening_hours: "Closed for renovation", amenities: [], rating: 3.5, contact_name: "DinkTagum Test Desk", contact_phone: "0900-000-0004", hourly_rate: null, schedule_note: "[TEST DATA] Under renovation", photo_urls: [] },
];

const POST_BODIES = [
  "Anyone available for a doubles game tonight?",
  "Looking for intermediate players this weekend!",
  "Great game today! \u{1F3D3}",
  "Anyone interested in joining an open play session?",
  "Looking for a beginner-friendly game.",
  "Who is playing this Saturday?",
  "Finally improving my serve!",
  "Looking for a partner for doubles.",
  "Anyone interested in a friendly match?",
  "Good games everyone!",
];

// Each entry is one match; game_records is private per player (RLS: player_id
// = auth.uid()), so every match becomes two rows, one per participant, with
// scores mirrored and the opponent stored as free text (there's no matches
// table or opponent foreign key in this schema).
const MATCHES = [
  { a: "alex", b: "mia", scoreA: 11, scoreB: 7, daysAgo: 14 },
  { a: "jordan", b: "kai", scoreA: 11, scoreB: 9, daysAgo: 12 },
  { a: "sam", b: "chris", scoreA: 11, scoreB: 8, daysAgo: 10 },
  { a: "kai", b: "jordan", scoreA: 11, scoreB: 6, daysAgo: 8 },
  { a: "jordan", b: "alex", scoreA: 11, scoreB: 9, daysAgo: 6 },
  { a: "kai", b: "mia", scoreA: 11, scoreB: 6, daysAgo: 5 },
  { a: "sam", b: "jordan", scoreA: 11, scoreB: 5, daysAgo: 3 },
  { a: "chris", b: "alex", scoreA: 11, scoreB: 3, daysAgo: 2 },
];

const CHATS = [
  { a: "alex", b: "mia", messages: [["a", "Hi! Are you available for a game tomorrow?"], ["b", "Yes! What time?"]] },
  { a: "jordan", b: "kai", messages: [["a", "Are you playing this weekend?"], ["b", "Yes, probably Saturday afternoon."]] },
  { a: "sam", b: "chris", messages: [["a", "Want to play a competitive match?"], ["b", "Sure, let's schedule one."]] },
];

function log(...args) {
  console.log(...args);
}

function daysFromNow(days, hour, minute = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(spec) {
  const { data, error } = await admin.auth.admin.createUser({
    email: spec.email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: spec.display_name },
  });
  if (!error) return data.user;
  const alreadyExists = /already.*registered|already.*exists/i.test(error.message);
  if (!alreadyExists) throw new Error(`Could not create auth user ${spec.email}: ${error.message}`);
  const existing = await findAuthUserByEmail(spec.email);
  if (!existing) throw new Error(`${spec.email} was reported as already registered but could not be found.`);
  return existing;
}

async function purgeTestUsers(userIds) {
  if (!userIds.length) return;
  await admin.from("conversations").delete().or(userIds.map((id) => `user_a.eq.${id},user_b.eq.${id}`).join(","));
  await admin.from("community_posts").delete().in("author_id", userIds);
  await admin.from("game_records").delete().in("player_id", userIds);
  await admin.from("reservations").delete().in("user_id", userIds);
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) log(`  ! Could not delete auth user ${id}: ${error.message}`);
  }
}

async function main() {
  log("== DinkTagum test data seed ==");

  // 1. Auth users + profiles ------------------------------------------------
  const users = {};
  for (const spec of TEST_USERS) {
    const authUser = await ensureAuthUser(spec);
    users[spec.key] = { ...spec, id: authUser.id };
  }
  const userIds = Object.values(users).map((u) => u.id);
  log(`Resolved ${userIds.length} test auth users (created if missing, reused if already present).`);

  if (PURGE_ONLY) {
    log("--purge passed: deleting all test data and the test auth users, then exiting.");
    await purgeTestUsers(userIds);
    log("Done. No test data was recreated.");
    return;
  }

  for (const user of Object.values(users)) {
    const { error } = await admin.from("profiles").upsert(
      {
        id: user.id,
        display_name: user.display_name,
        location: "Tagum City",
        skill_level: user.skill_level,
        avatar_url: `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(user.display_name)}`,
        preferred_game_type: user.preferred_game_type,
        is_directory_visible: true,
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(`Could not upsert profile for ${user.email}: ${error.message}`);
  }
  log("Profiles upserted for all test users.");

  // 2. Courts (only if the table is completely empty) -----------------------
  const { data: existingCourts, error: courtsSelectError } = await admin.from("courts").select("id, name").limit(1000);
  if (courtsSelectError) throw courtsSelectError;
  let courtPool = existingCourts || [];
  if (courtPool.length === 0) {
    const { data: insertedCourts, error: courtsInsertError } = await admin.from("courts").insert(TEST_COURTS).select("id, name");
    if (courtsInsertError) throw courtsInsertError;
    courtPool = insertedCourts;
    log(`Courts table was empty: inserted ${insertedCourts.length} clearly-labeled [TEST] courts.`);
  } else {
    log(`Courts table already has ${courtPool.length} row(s): reusing existing courts for test reservations instead of adding new ones.`);
  }

  // 3. Reservations (delete-then-reinsert keeps this idempotent) ------------
  await admin.from("reservations").delete().in("user_id", userIds);
  const reservationPlan = [
    { user: "alex", courtIdx: 0, start: daysFromNow(1, 16), status: "confirmed" },
    { user: "jordan", courtIdx: 1, start: daysFromNow(2, 7), status: "pending" },
    { user: "sam", courtIdx: 0, start: daysFromNow(2, 18), status: "confirmed" },
    { user: "mia", courtIdx: 1, start: daysFromNow(-9, 8), status: "confirmed" },
    { user: "kai", courtIdx: 2, start: daysFromNow(-11, 17), status: "confirmed" },
    { user: "chris", courtIdx: 0, start: daysFromNow(-4, 19), status: "cancelled" },
    { user: "mia", courtIdx: 3, start: daysFromNow(3, 6), status: "pending" },
  ];
  const reservationRows = reservationPlan.map((r) => {
    const court = courtPool[r.courtIdx % courtPool.length];
    const end = new Date(r.start.getTime() + 60 * 60 * 1000);
    return {
      user_id: users[r.user].id,
      court_id: court.id,
      start_time: r.start.toISOString(),
      end_time: end.toISOString(),
      status: r.status,
    };
  });
  const { error: reservationsError } = await admin.from("reservations").insert(reservationRows);
  if (reservationsError) log(`  ! Some reservations could not be inserted (likely a slot conflict with existing data): ${reservationsError.message}`);
  else log(`Inserted ${reservationRows.length} test reservations (mix of upcoming, past, pending, and cancelled).`);

  // 4. Community posts -------------------------------------------------------
  await admin.from("community_posts").delete().in("author_id", userIds);
  const authorCycle = Object.keys(users);
  const postRows = POST_BODIES.map((body, index) => ({
    author_id: users[authorCycle[index % authorCycle.length]].id,
    body,
    photo_urls: [],
    created_at: new Date(Date.now() - (POST_BODIES.length - index) * 6 * 60 * 60 * 1000).toISOString(),
  }));
  const { data: insertedPosts, error: postsError } = await admin.from("community_posts").insert(postRows).select("id");
  if (postsError) throw new Error(`Could not insert community posts: ${postsError.message}`);
  log(`Inserted ${postRows.length} test community posts.`);

  // 4b. Likes + comments on a few of those posts, so the feed doesn't look empty of reactions.
  const postIds = (insertedPosts || []).map((row) => row.id);
  await admin.from("community_post_likes").delete().in("post_id", postIds);
  await admin.from("community_post_comments").delete().in("post_id", postIds);
  if (postIds.length >= 3) {
    const likeRows = [
      { post_id: postIds[0], user_id: users.mia.id },
      { post_id: postIds[0], user_id: users.jordan.id },
      { post_id: postIds[0], user_id: users.kai.id },
      { post_id: postIds[1], user_id: users.sam.id },
      { post_id: postIds[2], user_id: users.chris.id },
      { post_id: postIds[2], user_id: users.alex.id },
    ];
    const { error: likesError } = await admin.from("community_post_likes").insert(likeRows);
    if (likesError) log(`  ! Could not insert test post likes: ${likesError.message}`);
    else log(`Inserted ${likeRows.length} test post likes.`);

    const commentRows = [
      { post_id: postIds[0], author_id: users.jordan.id, body: "Count me in!" },
      { post_id: postIds[0], author_id: users.kai.id, body: "Same, what time works?" },
      { post_id: postIds[2], author_id: users.mia.id, body: "Nice serve, congrats!" },
    ];
    const { error: commentsError } = await admin.from("community_post_comments").insert(commentRows);
    if (commentsError) log(`  ! Could not insert test post comments: ${commentsError.message}`);
    else log(`Inserted ${commentRows.length} test post comments.`);
  }

  // 4c. A couple of player connections (one accepted, one still pending).
  await admin.from("player_connections").delete().or(userIds.map((id) => `requester_id.eq.${id},recipient_id.eq.${id}`).join(","));
  const { error: connectionsError } = await admin.from("player_connections").insert([
    { requester_id: users.alex.id, recipient_id: users.mia.id, status: "accepted", responded_at: new Date().toISOString() },
    { requester_id: users.jordan.id, recipient_id: users.sam.id, status: "pending" },
  ]);
  if (connectionsError) log(`  ! Could not insert test player connections: ${connectionsError.message}`);
  else log("Inserted 2 test player connections (1 accepted, 1 pending).");

  // 5. Game records (matches) ------------------------------------------------
  await admin.from("game_records").delete().in("player_id", userIds);
  const gameRecordRows = MATCHES.flatMap((m) => {
    const playedOn = isoDate(daysFromNow(-m.daysAgo, 12));
    return [
      { player_id: users[m.a].id, played_on: playedOn, opponents: users[m.b].display_name, player_score: m.scoreA, opponent_score: m.scoreB },
      { player_id: users[m.b].id, played_on: playedOn, opponents: users[m.a].display_name, player_score: m.scoreB, opponent_score: m.scoreA },
    ];
  });
  const { error: gameRecordsError } = await admin.from("game_records").insert(gameRecordRows);
  if (gameRecordsError) throw new Error(`Could not insert game records: ${gameRecordsError.message}`);
  log(`Inserted ${gameRecordRows.length} test game records (${MATCHES.length} matches, one row per participant).`);

  // 6. Chat: conversations + messages -----------------------------------------
  await admin.from("conversations").delete().or(userIds.map((id) => `user_a.eq.${id},user_b.eq.${id}`).join(","));
  let messageCount = 0;
  for (const chat of CHATS) {
    const { data: convo, error: convoError } = await admin
      .from("conversations")
      .insert({ user_a: users[chat.a].id, user_b: users[chat.b].id })
      .select("id")
      .single();
    if (convoError) { log(`  ! Could not create conversation ${chat.a}<->${chat.b}: ${convoError.message}`); continue; }
    let sentAt = Date.now() - chat.messages.length * 60 * 1000;
    for (const [sender, content] of chat.messages) {
      const { error: messageError } = await admin.from("messages").insert({
        conversation_id: convo.id,
        sender_id: users[chat[sender]].id,
        content,
        created_at: new Date(sentAt).toISOString(),
      });
      if (messageError) log(`  ! Could not insert message in ${chat.a}<->${chat.b}: ${messageError.message}`);
      else messageCount += 1;
      sentAt += 60 * 1000;
    }
  }
  log(`Inserted ${messageCount} test chat messages across ${CHATS.length} conversations.`);
  log("(Reservation and message notifications are created automatically by existing DB triggers — not seeded directly.)");

  log("\nDone. Test accounts (all share one password):");
  for (const user of Object.values(users)) log(`  ${user.email}  ->  ${user.display_name}`);
  log(`  password: ${TEST_PASSWORD}`);
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message || error);
  // process.exit() here can race with sockets the Supabase client still has
  // open and crash with a native libuv assertion on Windows; exitCode lets
  // Node exit on its own once everything has actually finished closing.
  process.exitCode = 1;
});
