# DinkTagum

DinkTagum is a mobile-first pickleball and sports community app for Tagum City. Players can discover courts, reserve time slots, find other players, share community updates, track match results, and view notifications.

## Architecture

- **Expo SDK 57 / React Native** for Android, iOS, and web.
- **Expo Router** provides the app entry and tab navigation.
- **Supabase** provides Auth, Postgres data, Row Level Security, Realtime community posts, and database-backed notifications.
- `app/` holds thin route files; `src/screens/` holds one file per screen, plus `shared.jsx` for the common theme, styles, and small UI atoms.
- `src/context/` splits app state into focused providers — `AuthContext` (session/sign-out), `DashboardContext` (profile/courts/reservations), `CommunityFeedContext` (posts), and `OverlayNavContext` (which overlay, if any, is open). The last three are mounted only while signed in and keyed by user id, so signing out discards their state automatically.
- `lib/supabase.js` configures the Supabase client.
- `src/components/` holds shared native/web components, including the court map.
- `supabase/migrations/` is the **only** source of truth for schema, RLS, and triggers.

## Prerequisites

- **Node.js 20 LTS** or newer, and npm.
- **Git**.
- The **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779) / [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)) for the fastest way to run the app on a device — no native build tooling required.
- Optional, for emulators instead of a physical device: Android Studio (Android) or Xcode on macOS (iOS).
- A free [Supabase](https://supabase.com) account and project (see [Database setup](#database-setup)).

## Setup

```bash
git clone https://github.com/<your-username>/dink-tagum.git
cd dink-tagum
npm install
cp .env.example .env.local
npx expo start
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env.local
```

## Environment configuration

Add the following public client values to `.env.local`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Get the Supabase URL and publishable key from **Supabase Dashboard → Settings → API**. Never place a Supabase secret or service-role key in an Expo environment file.

## Database setup

If you're starting from a fresh Supabase project, link it to this repo first:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
```

The project ref is the subdomain in your project's URL (`https://<project-ref>.supabase.co`), also shown under **Supabase Dashboard → Settings → General**.

Then apply migrations with the Supabase CLI (do **not** run the legacy, pre-migration SQL files kept in `supabase/_archive/` for historical reference — they predate the hardened RLS policies and will not match the current schema):

```bash
npx supabase db reset
# or, against a linked remote project:
npx supabase db push
```

Assign administrators in Supabase Auth by setting `app_metadata.role = 'admin'`.

### Test data

`scripts/seed-test-data.mjs` creates six fictional player accounts (`@dinktagum.test`) with profiles, community posts, match history, court reservations, and chat messages, so the app has realistic data to test against. It needs the project's **service role key** (never put this in `.env.local` — it bypasses RLS and must never ship in the app):

```powershell
$env:EXPO_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run seed:test-data
```

Re-running it is safe — it only ever touches rows owned by those six test accounts. To remove the test accounts and all their data instead of recreating it, run `npm run seed:test-data:purge` with the same environment variables set.

Maps use Leaflet with OpenStreetMap tiles inside `react-native-webview`, which works out of the box in Expo Go, Android, iOS, and Web without requiring custom native Mapbox builds.

## Run the app

Start the development server:

```bash
npx expo start
```

- **Physical device:** open the Expo Go app and scan the QR code printed in the terminal.
- **Android emulator:** connect a device/emulator, then press `a`, or run `npm run android`.
- **iOS simulator:** on macOS with Xcode, press `i`, or run `npm run ios`.
- **Web:** press `w`, or run `npm run web`.

## Quality checks

```bash
npm run lint
npm run type-check
npx expo-doctor
```

`lint` expects ESLint to be installed in the project. `type-check` runs TypeScript without producing files.
