import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

// expo-secure-store persists values in the iOS Keychain / Android Keystore instead of
// plain-text SQLite, but each item is capped at roughly 2048 bytes on Android — well
// under a Supabase session's combined access + refresh token payload — so values are
// split into chunks on write and reassembled on read.
const CHUNK_SIZE = 1800;
const chunkCountKey = (key) => `${key}_chunks`;
const chunkKey = (key, index) => `${key}_${index}`;

const secureStoreAuthAdapter = {
  async getItem(key) {
    const chunkCountRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    if (chunkCountRaw === null) return null;
    const chunkCount = Number(chunkCountRaw);
    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index)))
    );
    return chunks.some((chunk) => chunk === null) ? null : chunks.join("");
  },
  async setItem(key, value) {
    const previousCountRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    const previousCount = previousCountRaw ? Number(previousCountRaw) : 0;
    const chunks = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)));
    await Promise.all(
      Array.from({ length: Math.max(0, previousCount - chunks.length) }, (_, offset) =>
        SecureStore.deleteItemAsync(chunkKey(key, chunks.length + offset))
      )
    );
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
  },
  async removeItem(key) {
    const chunkCountRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    const chunkCount = chunkCountRaw ? Number(chunkCountRaw) : 0;
    await Promise.all(Array.from({ length: chunkCount }, (_, index) => SecureStore.deleteItemAsync(chunkKey(key, index))));
    await SecureStore.deleteItemAsync(chunkCountKey(key));
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        // expo-secure-store has no web implementation; omitting `storage` on web lets
        // the Supabase client fall back to its own default (the browser's localStorage).
        ...(Platform.OS === "web" ? {} : { storage: secureStoreAuthAdapter }),
        autoRefreshToken: true,
        persistSession: true,
        // On web, a password-recovery link redirects back with the session in
        // the URL and this parses it automatically. Native has no window.location
        // to parse — AuthContext handles the equivalent deep link manually instead.
        detectSessionInUrl: Platform.OS === "web",
      },
    })
  : null;
