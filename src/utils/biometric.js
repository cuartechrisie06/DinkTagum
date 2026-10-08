// Biometric unlock (fingerprint / Face ID) for a saved session.
//
// The Supabase session already survives restarts in SecureStore; when the
// player opts in, the app asks for their fingerprint or face before showing a
// session restored at launch. A fresh password / Google sign-in skips the
// prompt. Not available on web. Face ID needs a development build (Expo Go
// doesn't support it); fingerprint works in Expo Go on Android.
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const PREF_KEY = "dinktagum.biometricUnlock";

// Set by the sign-in screen so the lock doesn't immediately ask again.
let freshSignIn = false;
export function markFreshSignIn() { freshSignIn = true; }
export function consumeFreshSignIn() {
  const value = freshSignIn;
  freshSignIn = false;
  return value;
}

// "Face ID", "fingerprint" or "biometrics" for button text.
export function biometricLabel(types = []) {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "Face ID";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  return "biometrics";
}

export async function biometricStatus() {
  if (Platform.OS === "web") return { available: false, label: "biometrics" };
  try {
    const [hardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    return { available: hardware && enrolled, label: biometricLabel(types) };
  } catch {
    return { available: false, label: "biometrics" };
  }
}

// "on" | "off" | null (never asked).
export async function getBiometricPref() {
  if (Platform.OS === "web") return "off";
  try {
    const value = await SecureStore.getItemAsync(PREF_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

export async function setBiometricPref(value) {
  if (Platform.OS === "web") return;
  try { await SecureStore.setItemAsync(PREF_KEY, value); } catch { /* best effort */ }
}

export async function unlockWithBiometrics(label = "biometrics") {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: `Unlock DinkTagum with ${label}`, cancelLabel: "Cancel" });
    return result.success;
  } catch {
    return false;
  }
}
