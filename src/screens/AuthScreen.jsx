import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Button, C, Icon, styles } from "./shared";

const PASSWORD_HINT = "8+ characters, mixed case + a number";
function isStrongPassword(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

function AuthField({ label, style, accessory, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={{ justifyContent: "center" }}>
        <TextInput
          {...inputProps}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={C.textFaint}
          style={[styles.input, focused && styles.inputFocused, style]}
          accessibilityLabel={label}
        />
        {accessory}
      </View>
    </View>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === "register";
  const activeRequestRef = useRef(null);

  const submit = async () => {
    const loginEmail = email.trim().toLowerCase();
    setNotice("");
    if (!isSupabaseConfigured) return setNotice("Copy .env.example to .env.local, add your project values, then restart Expo.");
    if (!loginEmail || !password) return setNotice("Enter your email address and password.");
    if (registering && !displayName.trim()) return setNotice("Enter the name other players will see.");
    if (registering && !isStrongPassword(password)) {
      return setNotice("Use at least 8 characters, with a mix of uppercase, lowercase, and numbers.");
    }
    setLoading(true);
    const requestId = Symbol("auth-request");
    activeRequestRef.current = requestId;
    try {
      const request = registering
        ? supabase.auth.signUp({ email: loginEmail, password, options: { data: { display_name: displayName.trim() } } })
        : supabase.auth.signInWithPassword({ email: loginEmail, password });
      const { data, error } = await request;
      if (activeRequestRef.current !== requestId) return;
      if (error) {
        setNotice(error.message);
        return;
      }
      if (registering && !data.session) {
        setNotice("Account created. Check your email and confirm your address, then log in.");
        setMode("login");
      } else if (registering) {
        setNotice("Account created. Opening your dashboard…");
      }
    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      setNotice(error?.message || "Something went wrong. Please try again.");
    } finally {
      if (activeRequestRef.current === requestId) setLoading(false);
    }
  };

  const submitResetRequest = async () => {
    const loginEmail = email.trim().toLowerCase();
    setNotice("");
    if (!isSupabaseConfigured) return setNotice("Copy .env.example to .env.local, add your project values, then restart Expo.");
    if (!loginEmail) return setNotice("Enter the email address on your account.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, { redirectTo: Linking.createURL("reset-password") });
    setLoading(false);
    if (error) { setNotice(error.message); return; }
    setNotice("Check your email for a link to reset your password.");
  };

  if (mode === "reset") {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 26, maxWidth: 460, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
            <LinearGradient colors={[C.volt, "#B9D61F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={authStyles.logo}>
              <Icon name="key" size={28} color={C.ink} />
            </LinearGradient>
            <Text style={authStyles.brand}>DinkTagum</Text>
            <Text style={[styles.loginTitle, { marginTop: 26 }]}>Reset your password</Text>
            <Text style={styles.loginSub}>We&rsquo;ll email you a link to set a new one.</Text>
            <View style={{ marginTop: 28, gap: 16 }}>
              <AuthField label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" editable={!loading} />
            </View>
            <Button label="Send reset link" onPress={submitResetRequest} loading={loading} style={{ marginTop: 26 }} />
            {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
            <TouchableOpacity onPress={() => { setNotice(""); setMode("login"); }} disabled={loading} accessibilityRole="button" style={{ marginTop: 16, alignSelf: "center" }}>
              <Text style={styles.signupText}>Back to log in</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 26, maxWidth: 460, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[C.volt, "#B9D61F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={authStyles.logo}>
            <Icon name="tennisball" size={30} color={C.ink} />
          </LinearGradient>
          <Text style={authStyles.brand}>DinkTagum</Text>
          <Text style={[styles.loginTitle, { marginTop: 26 }]}>{registering ? "Create your account" : "Welcome back"}</Text>
          <Text style={styles.loginSub}>{registering ? "Join Tagum City's pickleball community." : "Log in to find your next game."}</Text>

          <View style={{ marginTop: 28, gap: 16 }}>
            {registering && <AuthField label="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholder="Your name" editable={!loading} />}
            <AuthField label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" editable={!loading} />
            <AuthField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder={registering ? PASSWORD_HINT : "Your password"}
              editable={!loading}
              style={{ paddingRight: 48 }}
              accessory={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={authStyles.eye} accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} hitSlop={8}>
                  <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={C.textDim} />
                </TouchableOpacity>
              }
            />
            {!registering ? (
              <TouchableOpacity onPress={() => { setNotice(""); setMode("reset"); }} disabled={loading} accessibilityRole="button" style={{ alignSelf: "flex-end", marginTop: -8 }}>
                <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700" }}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Button label={registering ? "Create account" : "Log in"} onPress={submit} loading={loading} style={{ marginTop: 26 }} />
          {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
          <TouchableOpacity onPress={() => { setNotice(""); setMode(registering ? "login" : "register"); }} disabled={loading} accessibilityRole="button">
            <Text style={styles.signupText}>{registering ? "Already have an account? " : "New to DinkTagum? "}<Text style={{ color: C.volt, fontWeight: "800" }}>{registering ? "Log in" : "Sign up"}</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// Shown instead of the normal app whenever AuthContext reports a
// PASSWORD_RECOVERY session (see app/_layout.jsx) — tapping the link in a
// reset-password email signs the user into a temporary session meant only
// for setting a new password, not for using the app.
export function ResetPasswordScreen() {
  const { clearPasswordRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setNotice("");
    if (!isStrongPassword(password)) return setNotice("Use at least 8 characters, with a mix of uppercase, lowercase, and numbers.");
    if (password !== confirmPassword) return setNotice("Passwords do not match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setNotice(error.message); return; }
    clearPasswordRecovery();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 26, maxWidth: 460, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={[C.volt, "#B9D61F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={authStyles.logo}>
            <Icon name="lock-closed" size={28} color={C.ink} />
          </LinearGradient>
          <Text style={authStyles.brand}>DinkTagum</Text>
          <Text style={[styles.loginTitle, { marginTop: 26 }]}>Set a new password</Text>
          <Text style={styles.loginSub}>Choose a new password for your account.</Text>
          <View style={{ marginTop: 28, gap: 16 }}>
            <AuthField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder={PASSWORD_HINT}
              editable={!loading}
              style={{ paddingRight: 48 }}
              accessory={
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={authStyles.eye} accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} hitSlop={8}>
                  <Icon name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={C.textDim} />
                </TouchableOpacity>
              }
            />
            <AuthField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showPassword} placeholder="Re-enter your new password" editable={!loading} />
          </View>
          <Button label="Update password" onPress={submit} loading={loading} style={{ marginTop: 26 }} />
          {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
          <TouchableOpacity onPress={signOut} disabled={loading} accessibilityRole="button" style={{ marginTop: 16, alignSelf: "center" }}>
            <Text style={styles.signupText}>Cancel and sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const authStyles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  brand: { color: C.mist, fontSize: 15, fontWeight: "800", letterSpacing: 0.5, marginTop: 12 },
  eye: { position: "absolute", right: 14 },
});
