// Grants (or with --revoke, removes) DinkTagum admin for an existing account.
// Admin is app_metadata.role = "admin" on the auth user (see private.is_admin()
// and AuthContext); only the service role can change app_metadata.
//
//   node --env-file=.env.local --env-file=.env.seed.local scripts/set-admin.mjs someone@example.com
//   node --env-file=.env.local --env-file=.env.seed.local scripts/set-admin.mjs someone@example.com --revoke
//
// The person must sign out and back in (or wait for their session to refresh)
// before the app shows the admin screen.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv.slice(2).find((arg) => !arg.startsWith("--"))?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || /paste-your|your-service-role-key/.test(SERVICE_ROLE_KEY)) {
  console.error("Add your service role key to .env.seed.local (SUPABASE_SERVICE_ROLE_KEY=...).");
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error("Usage: node --env-file=.env.local --env-file=.env.seed.local scripts/set-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// The admin API has no lookup by email, so page through users.
async function findUser(target) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((user) => (user.email || "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

const user = await findUser(email);
if (!user) {
  console.error(`No account found for ${email}. They need to sign up in the app first.`);
  process.exit(1);
}

const appMetadata = { ...(user.app_metadata || {}) };
if (revoke) delete appMetadata.role;
else appMetadata.role = "admin";

const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMetadata });
if (error) {
  console.error(`Could not update ${email}: ${error.message}`);
  process.exit(1);
}
console.log(`${email} is ${revoke ? "no longer an admin" : "now an admin"}. They need to sign out and back in to see the change.`);
