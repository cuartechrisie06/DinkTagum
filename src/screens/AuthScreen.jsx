import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Button, C, Icon, R, S, ScreenFrame, styles, useTopInset } from "./shared";

const PASSWORD_HINT = "8+ characters, mixed case + a number";
// Brighter than C.textFaint so placeholder text stays readable on the dark fields.
const PLACEHOLDER = "rgba(255,253,238,0.55)";

function isStrongPassword(value) {
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
}

// Per-field messages for the login / sign-up form; empty object when valid.
export function validateAuthFields({ registering, displayName, email, password }) {
  const errors = {};
  const trimmedEmail = String(email || "").trim();
  if (registering && !String(displayName || "").trim()) errors.displayName = "Enter the name other players will see.";
  if (!trimmedEmail) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) errors.email = "That doesn't look like an email address.";
  if (!password) errors.password = "Enter your password.";
  else if (registering && !isStrongPassword(password)) errors.password = "Use 8+ characters with upper and lowercase letters and a number.";
  return errors;
}

function AuthField({ label, error, accessory, inputRef, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={{ justifyContent: "center" }}>
        <TextInput
          ref={inputRef}
          {...inputProps}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={PLACEHOLDER}
          style={[styles.input, focused && styles.inputFocused, error && authStyles.inputError, style]}
          accessibilityLabel={label}
          accessibilityHint={error || undefined}
        />
        {accessory}
      </View>
      {error ? (
        <View style={authStyles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size={14} color={C.butter} />
          <Text style={authStyles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EyeToggle({ shown, onToggle }) {
  return (
    <TouchableOpacity onPress={onToggle} style={authStyles.eye} accessibilityRole="button" accessibilityLabel={shown ? "Hide password" : "Show password"}>
      <Icon name={shown ? "eye-off-outline" : "eye-outline"} size={20} color={C.textDim} />
    </TouchableOpacity>
  );
}

// Shared frame for every auth screen: hero up top, form centered below, and
// the whole thing scrolls/lifts out of the keyboard's way on both platforms.
function AuthLayout({ icon, title, subtitle, showFeatures, children }) {
  // Top inset applied by hand: the hero's pill row sat under the status bar.
  const top = useTopInset();
  return (
    <ScreenFrame>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
          <ScrollView contentContainerStyle={[authStyles.scroll, { paddingTop: top + S.xxl }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <View style={authStyles.hero}>
              <LinearGradient colors={[C.volt, "#B9D61F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={authStyles.logo}>
                <Icon name={icon} size={30} color={C.ink} />
              </LinearGradient>
              <Text style={authStyles.brand} accessibilityRole="header">DinkTagum</Text>
              <Text style={authStyles.tagline}>Tagum City&apos;s pickleball hub</Text>
              {showFeatures ? (
                <View style={authStyles.features}>
                  {[["location", "Courts"], ["people", "Open play"], ["trophy", "Match stats"]].map(([featureIcon, label]) => (
                    <View key={label} style={authStyles.feature}>
                      <Icon name={featureIcon} size={13} color={C.volt} />
                      <Text style={authStyles.featureText}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={authStyles.card}>
              <Text style={styles.loginTitle}>{title}</Text>
              <Text style={styles.loginSub}>{subtitle}</Text>
              {children}
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

function Notice({ children }) {
  if (!children) return null;
  return <Text style={styles.authNotice} accessibilityLiveRegion="polite">{children}</Text>;
}

function TextLink({ onPress, disabled, children, style, accessibilityLabel }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[authStyles.link, style]}>
      {children}
    </TouchableOpacity>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === "register";
  const activeRequestRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // Typing in a field clears its error.
  const edit = (setter, key) => (value) => {
    setter(value);
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const switchMode = (next) => { setNotice(""); setErrors({}); setMode(next); };

  const submit = async () => {
    const loginEmail = email.trim().toLowerCase();
    setNotice("");
    if (!isSupabaseConfigured) return setNotice("Copy .env.example to .env.local, add your project values, then restart Expo.");
    const fieldErrors = validateAuthFields({ registering, displayName, email, password });
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return undefined;

    setLoading(true);
    const requestId = Symbol("auth-request");
    activeRequestRef.current = requestId;
    try {
      const request = registering
        ? supabase.auth.signUp({ email: loginEmail, password, options: { data: { display_name: displayName.trim() } } })
        : supabase.auth.signInWithPassword({ email: loginEmail, password });
      const { data, error } = await request;
      if (activeRequestRef.current !== requestId) return undefined;
      if (error) {
        // Wrong credentials belong next to the password field.
        if (/invalid login credentials/i.test(error.message)) setErrors({ password: "Email or password is incorrect." });
        else setNotice(error.message);
        return undefined;
      }
      if (registering && !data.session) {
        setNotice("Account created. Check your email and confirm your address, then log in.");
        setMode("login");
      } else if (registering) {
        setNotice("Account created. Opening your dashboard…");
      }
    } catch (error) {
      if (activeRequestRef.current !== requestId) return undefined;
      setNotice(error?.message || "Something went wrong. Please try again.");
    } finally {
      if (activeRequestRef.current === requestId) setLoading(false);
    }
    return undefined;
  };

  const submitResetRequest = async () => {
    const loginEmail = email.trim().toLowerCase();
    setNotice("");
    if (!isSupabaseConfigured) return setNotice("Copy .env.example to .env.local, add your project values, then restart Expo.");
    const { email: emailError } = validateAuthFields({ registering: false, email, password: "x" });
    setErrors(emailError ? { email: emailError } : {});
    if (emailError) return undefined;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, { redirectTo: Linking.createURL("reset-password") });
    setLoading(false);
    if (error) { setNotice(error.message); return undefined; }
    setNotice("Check your email for a link to reset your password.");
    return undefined;
  };

  const emailField = (
    <AuthField
      inputRef={emailRef}
      label="Email address"
      value={email}
      onChangeText={edit(setEmail, "email")}
      error={errors.email}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      autoComplete="email"
      textContentType="emailAddress"
      inputMode="email"
      placeholder="you@example.com"
      editable={!loading}
      returnKeyType={mode === "reset" ? "send" : "next"}
      onSubmitEditing={mode === "reset" ? submitResetRequest : () => passwordRef.current?.focus()}
      submitBehavior={mode === "reset" ? "blurAndSubmit" : "submit"}
    />
  );

  if (mode === "reset") {
    return (
      <AuthLayout icon="key" title="Reset your password" subtitle="We'll email you a link to set a new one.">
        <View style={authStyles.fields}>{emailField}</View>
        <Button label="Send reset link" onPress={submitResetRequest} loading={loading} style={{ marginTop: S.xl }} />
        <Notice>{notice}</Notice>
        <TextLink onPress={() => switchMode("login")} disabled={loading} style={{ alignSelf: "center", marginTop: S.sm }}>
          <Text style={[styles.signupText, { marginTop: 0 }]}>Back to log in</Text>
        </TextLink>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon="tennisball"
      showFeatures
      title={registering ? "Create your account" : "Welcome back"}
      subtitle={registering ? "Join Tagum City's pickleball community." : "Log in to find your next game."}
    >
      <View style={authStyles.fields}>
        {registering ? (
          <AuthField
            label="Display name"
            value={displayName}
            onChangeText={edit(setDisplayName, "displayName")}
            error={errors.displayName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            placeholder="Your name"
            editable={!loading}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
          />
        ) : null}
        {emailField}
        <AuthField
          inputRef={passwordRef}
          label="Password"
          value={password}
          onChangeText={edit(setPassword, "password")}
          error={errors.password}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={registering ? "new-password" : "current-password"}
          textContentType={registering ? "newPassword" : "password"}
          placeholder={registering ? PASSWORD_HINT : "Your password"}
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={submit}
          style={{ paddingRight: 52 }}
          accessory={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />
        {!registering ? (
          <TextLink onPress={() => switchMode("reset")} disabled={loading} style={{ alignSelf: "flex-end", marginTop: -S.sm }}>
            <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700" }}>Forgot password?</Text>
          </TextLink>
        ) : null}
      </View>
      <Button
        label={registering ? (loading ? "Creating account…" : "Create account") : loading ? "Logging in…" : "Log in"}
        onPress={submit}
        loading={loading}
        style={{ marginTop: S.lg }}
      />
      <Notice>{notice}</Notice>
      <TextLink onPress={() => switchMode(registering ? "login" : "register")} disabled={loading} style={{ alignSelf: "center", marginTop: S.sm }} accessibilityLabel={registering ? "Already have an account? Log in" : "New to DinkTagum? Sign up"}>
        <Text style={[styles.signupText, { marginTop: 0 }]}>{registering ? "Already have an account? " : "New to DinkTagum? "}<Text style={{ color: C.volt, fontWeight: "800" }}>{registering ? "Log in" : "Sign up"}</Text></Text>
      </TextLink>
    </AuthLayout>
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
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const confirmRef = useRef(null);

  const submit = async () => {
    setNotice("");
    const fieldErrors = {};
    if (!isStrongPassword(password)) fieldErrors.password = "Use 8+ characters with upper and lowercase letters and a number.";
    if (password !== confirmPassword) fieldErrors.confirm = "Passwords do not match.";
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setNotice(error.message); return; }
    clearPasswordRecovery();
  };

  return (
    <AuthLayout icon="lock-closed" title="Set a new password" subtitle="Choose a new password for your account.">
      <View style={authStyles.fields}>
        <AuthField
          label="New password"
          value={password}
          onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
          error={errors.password}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder={PASSWORD_HINT}
          editable={!loading}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
          style={{ paddingRight: 52 }}
          accessory={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
        />
        <AuthField
          inputRef={confirmRef}
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(v) => { setConfirmPassword(v); setErrors((e) => ({ ...e, confirm: undefined })); }}
          error={errors.confirm}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder="Re-enter your new password"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </View>
      <Button label={loading ? "Updating…" : "Update password"} onPress={submit} loading={loading} style={{ marginTop: S.xl }} />
      <Notice>{notice}</Notice>
      <TextLink onPress={signOut} disabled={loading} style={{ alignSelf: "center", marginTop: S.sm }}>
        <Text style={[styles.signupText, { marginTop: 0 }]}>Cancel and sign out</Text>
      </TextLink>
    </AuthLayout>
  );
}

const authStyles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: S.xl, paddingVertical: S.xxl, maxWidth: 460, width: "100%", alignSelf: "center" },
  hero: { alignItems: "center", marginBottom: S.xl },
  logo: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", shadowColor: C.volt, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  brand: { color: C.paper, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: S.md },
  tagline: { color: C.mist, fontSize: 14.5, marginTop: 4 },
  features: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: S.sm, marginTop: S.lg },
  feature: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.voltSoft, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 6 },
  featureText: { color: C.volt, fontSize: 12.5, fontWeight: "700" },
  card: { backgroundColor: "rgba(12,52,44,0.72)", borderWidth: 1, borderColor: C.line, borderRadius: R.xl, padding: S.xl },
  fields: { marginTop: S.xl, gap: S.lg },
  inputError: { borderColor: C.butter },
  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginTop: 6 },
  errorText: { color: C.butter, fontSize: 12.5, lineHeight: 17, flex: 1 },
  eye: { position: "absolute", right: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  link: { minHeight: 44, justifyContent: "center", paddingHorizontal: S.xs },
});
