import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { biometricStatus, consumeFreshSignIn, getBiometricPref, setBiometricPref, unlockWithBiometrics } from "../utils/biometric";
import { chooseAction } from "../utils/confirm";
import { Button, C, Icon, R, S, ScreenFrame, useTopInset } from "../screens/shared";

// Wraps the signed-in app. A session restored at launch stays hidden behind
// a fingerprint / Face ID prompt when the player turned that on. Right after
// a fresh sign-in it asks once whether to turn it on.
export function BiometricLock({ children }) {
  const { signOut } = useAuth();
  const top = useTopInset();
  const [state, setState] = useState({ phase: "checking", label: "biometrics" });

  const unlock = useCallback(async (label) => {
    setState((s) => ({ ...s, phase: "prompting" }));
    const ok = await unlockWithBiometrics(label);
    setState((s) => ({ ...s, phase: ok ? "open" : "locked" }));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const fresh = consumeFreshSignIn();
      const [{ available, label }, pref] = await Promise.all([biometricStatus(), getBiometricPref()]);
      if (!active) return;
      if (!available) { setState({ phase: "open", label }); return; }
      if (fresh) {
        setState({ phase: "open", label });
        if (pref === null) {
          chooseAction(`Unlock with ${label} next time?`, "Skip typing your password when you open DinkTagum. You can turn this off on your Profile.", [
            { label: `Use ${label}`, icon: "finger-print", onPress: () => setBiometricPref("on") },
            { label: "Not now", icon: "close", onPress: () => setBiometricPref("off") },
          ]);
        }
        return;
      }
      if (pref === "on") {
        setState({ phase: "locked", label });
        unlock(label);
      } else {
        setState({ phase: "open", label });
      }
    })();
    return () => { active = false; };
  }, [unlock]);

  if (state.phase === "open") return children;

  return (
    <ScreenFrame>
      <View style={[lockStyles.wrap, { paddingTop: top + S.xxl }]}>
        {state.phase === "checking" ? <ActivityIndicator color={C.volt} /> : (
          <>
            <View style={lockStyles.icon}><Icon name="finger-print" size={36} color={C.volt} /></View>
            <Text style={lockStyles.title} accessibilityRole="header">DinkTagum is locked</Text>
            <Text style={lockStyles.body}>Unlock with {state.label} to continue.</Text>
            <Button label={`Unlock with ${state.label}`} icon="finger-print" onPress={() => unlock(state.label)} loading={state.phase === "prompting"} style={{ alignSelf: "stretch", marginTop: S.xl }} />
            <Button variant="ghost" label="Log in with password instead" onPress={signOut} style={{ alignSelf: "stretch", marginTop: S.sm, minHeight: 48 }} />
          </>
        )}
      </View>
    </ScreenFrame>
  );
}

const lockStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: S.xl },
  icon: { width: 80, height: 80, borderRadius: R.xl, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center" },
  title: { color: C.paper, fontSize: 22, fontWeight: "800", marginTop: S.lg },
  body: { color: C.textDim, fontSize: 14.5, marginTop: S.sm, textAlign: "center" },
});
