# DinkTagum

DinkTagum is a mobile-first pickleball and sports community app for Tagum City. Players can discover courts, reserve time slots, find other players, share community updates, track match results, and view notifications.

## Architecture

- **Expo SDK 57 / React Native** for Android, iOS, and web.
- **Expo Router** provides the app entry and tab navigation.
- **Supabase** provides Auth, Postgres data, Row Level Security, Realtime community posts, and database-backed notifications.
- `app/` holds thin route files; `src/screens/DinkScreens.jsx` holds the UI screens.
- `src/context/AppDataContext.jsx` owns the shared auth session and dashboard data (one provider for all tabs).
- `lib/supabase.js` configures the Supabase client.
- `src/components/` holds shared native/web components, including the court map.
- `supabase/migrations/` is the **only** source of truth for schema, RLS, and triggers.

## Setup

```bash
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

Apply migrations with the Supabase CLI (do **not** run legacy root SQL files such as `feature-foundation.sql`, `profiles-setup.sql`, or `dashboard-data-setup.sql` against a migrated project):

```bash
npx supabase db reset
# or, against a linked remote project:
npx supabase db push
```

Assign administrators in Supabase Auth by setting `app_metadata.role = 'admin'`.

Maps use Leaflet with OpenStreetMap tiles inside `react-native-webview`, which works out of the box in Expo Go, Android, iOS, and Web without requiring custom native Mapbox builds.

## Run the app

Start the development server:

```bash
npx expo start
```

- **Android:** connect a device/emulator, then press `a`, or run `npm run android`.
- **iOS:** on macOS with Xcode, press `i`, or run `npm run ios`.
- **Web:** press `w`, or run `npm run web`.

## Quality checks

```bash
npm run lint
npm run type-check
npx expo-doctor
```

`lint` expects ESLint to be installed in the project. `type-check` runs TypeScript without producing files.
