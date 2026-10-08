import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";

const AuthContext = createContext(null);

// A password-recovery email link redirects back with the new session encoded
// either as a PKCE `code` query param or, for the implicit flow, as
// access/refresh tokens in the URL's hash fragment. Web has detectSessionInUrl
// for this already (see lib/supabase.js); native has no window.location, so
// the same redirect arrives here as a deep link and is parsed by hand.
// Also used for the Google sign-in redirect (utils/socialAuth.js).
export async function consumeAuthRedirectUrl(url) {
  if (!supabase || !url) return;
  const parsed = Linking.parse(url);
  const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  const fragmentParams = Object.fromEntries(new URLSearchParams(fragment));
  const params = { ...parsed.queryParams, ...fragmentParams };
  if (params.code) {
    await supabase.auth.exchangeCodeForSession(String(params.code));
  } else if (params.access_token && params.refresh_token) {
    await supabase.auth.setSession({ access_token: String(params.access_token), refresh_token: String(params.refresh_token) });
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(() => !supabase);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
        setAuthReady(true);
      })
      .catch(() => {
        setSession(null);
        setAuthReady(true);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !supabase) return undefined;
    Linking.getInitialURL().then((url) => { if (url) consumeAuthRedirectUrl(url); });
    const subscription = Linking.addEventListener("url", ({ url }) => consumeAuthRedirectUrl(url));
    return () => subscription.remove();
  }, []);

  const signOut = useCallback(async () => {
    setPasswordRecovery(false);
    await supabase?.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const isAdmin = session?.user?.app_metadata?.role === "admin";

  const value = { session, authReady, isAdmin, signOut, passwordRecovery, clearPasswordRecovery };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
