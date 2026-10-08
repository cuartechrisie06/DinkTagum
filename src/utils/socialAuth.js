// Google sign-in through Supabase OAuth.
//
// Off unless EXPO_PUBLIC_GOOGLE_SIGN_IN=true, because it needs setup outside
// the app (see README "Google sign-in"): the Google provider enabled in
// Supabase (Auth > Providers) and this app's redirect URL allow-listed
// (Auth > URL Configuration), e.g. dink-tagum://auth-callback and, for Expo
// Go, the exp://… URL printed by Linking.createURL("auth-callback").
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "../../lib/supabase";
import { consumeAuthRedirectUrl } from "../context/AuthContext";

export const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === "true";

// Returns { ok } | { cancelled: true } | { error }.
export async function signInWithGoogle() {
  if (!supabase) return { error: "Supabase is not configured." };
  try {
    if (Platform.OS === "web") {
      // Full-page redirect; detectSessionInUrl picks the session up on return.
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
      return error ? { error: error.message } : { ok: true };
    }
    const redirectTo = Linking.createURL("auth-callback");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
    if (error) return { error: error.message };
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return { cancelled: true };
    await consumeAuthRedirectUrl(result.url);
    return { ok: true };
  } catch (error) {
    return { error: error?.message || "Google sign-in didn't work. Try your email and password instead." };
  }
}
