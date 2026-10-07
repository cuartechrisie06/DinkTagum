import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../screens/shared";

// App-wide toasts and bottom sheets that replace Alert.alert / window.alert.
//
// utils/confirm.js calls into this module (it isn't a component), so hosts
// register themselves here. Toasts go to the most recently mounted
// <ToastHost>: the app root normally, or the one inside the overlay Modal
// while it's open (on Android a Modal is its own window, so a root-level
// toast would be hidden behind it). Sheets are Modals, which always stack
// on top, so a single <SheetHost> at the root serves the whole app.


const toastHosts = [];
let sheetHost = null;

const TONES = {
  success: { icon: "checkmark-circle", color: C.volt },
  error: { icon: "alert-circle", color: C.butter },
  info: { icon: "information-circle", color: C.volt },
};

// Errors in this app are phrased "Could not…", "Check…", "… failed".
export function inferTone(title) {
  return /^(could not|couldn't|check|upload failed|something went wrong)|failed|error/i.test(String(title || "")) ? "error" : "success";
}

export function showToast({ title, message, tone }) {
  const host = toastHosts[toastHosts.length - 1];
  if (!host) return false;
  host({ id: Date.now() + Math.random(), title, message, tone: tone || inferTone(title) });
  return true;
}

export function showSheet(sheet) {
  if (!sheetHost) return false;
  sheetHost(sheet);
  return true;
}

export function ToastHost() {
  const [toast, setToast] = useState(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  useEffect(() => {
    const host = (next) => {
      clearTimeout(timer.current);
      setToast(next);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, next.tone === "error" ? 5000 : 3500);
    };
    toastHosts.push(host);
    return () => {
      clearTimeout(timer.current);
      const index = toastHosts.indexOf(host);
      if (index >= 0) toastHosts.splice(index, 1);
    };
  }, [hide, opacity]);

  if (!toast) return null;
  const tone = TONES[toast.tone] || TONES.info;
  return (
    <SafeAreaView edges={["top"]} style={styles.toastWrap} pointerEvents="box-none">
      <Animated.View style={[styles.toast, { borderColor: tone.color, opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <View style={styles.toastIcon}><Ionicons name={tone.icon} size={18} color={tone.color} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toastTitle}>{toast.title}</Text>
          {toast.message ? <Text style={styles.toastBody}>{toast.message}</Text> : null}
        </View>
        <TouchableOpacity onPress={hide} style={styles.toastClose} accessibilityRole="button" accessibilityLabel="Dismiss message">
          <Ionicons name="close" size={16} color={C.textDim} />
        </TouchableOpacity>
      </Animated.View>
    </SafeAreaView>
  );
}

// sheet: { title, message, actions: [{ label, icon, tone: "primary" | "danger" | "default", onPress }], onDismiss }
export function SheetHost() {
  const [sheet, setSheet] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    sheetHost = (next) => { setSheet(next); setVisible(true); };
    return () => { sheetHost = null; };
  }, []);

  const close = (action) => {
    setVisible(false);
    const run = () => (action ? action.onPress?.() : sheet?.onDismiss?.());
    // Browsers only allow window.open (Linking on web) inside the click
    // itself; on native, let the slide-out finish before e.g. leaving the app.
    if (Platform.OS === "web") run();
    else setTimeout(run, 180);
    // Unmount after the slide-out (see below).
    setTimeout(() => setSheet((current) => (current === sheet ? null : current)), 400);
  };

  // Mounted only while a sheet exists: react-native-web stacks Modals in the
  // order they mount, so a Modal mounted at startup would open *behind* the
  // overlay screens (court detail, chats). Native always stacks the newest.
  if (!sheet) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => close(null)} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => close(null)} accessibilityRole="button" accessibilityLabel="Close" />
        {(
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle} accessibilityRole="header">{sheet.title}</Text>
            {sheet.message ? <Text style={styles.sheetMessage}>{sheet.message}</Text> : null}
            <View style={{ gap: 10, marginTop: 18 }}>
              {sheet.actions.map((action) => {
                const primary = action.tone === "primary";
                const danger = action.tone === "danger";
                return (
                  <TouchableOpacity
                    key={action.label}
                    onPress={() => close(action)}
                    style={[styles.sheetAction, primary && styles.sheetActionPrimary, danger && styles.sheetActionDanger]}
                    accessibilityRole="button"
                    accessibilityLabel={action.accessibilityLabel || action.label}
                  >
                    {action.icon ? <Ionicons name={action.icon} size={19} color={primary ? C.ink : danger ? C.butter : C.paper} style={{ marginRight: 10 }} /> : null}
                    <Text style={[styles.sheetActionText, primary && { color: C.ink }, danger && { color: C.butter }]}>{action.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={() => close(null)} style={[styles.sheetAction, styles.sheetCancel]} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={[styles.sheetActionText, { color: C.textDim }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toastWrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10000, elevation: 10000, paddingHorizontal: 16, paddingTop: 8 },
  toast: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface2, borderRadius: 16, padding: 12, borderWidth: 1.5, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8 },
  toastIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: "rgba(226,251,206,0.2)" },
  toastTitle: { color: C.paper, fontSize: 13.5, fontWeight: "700" },
  toastBody: { color: "rgba(255,253,238,0.75)", fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  toastClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { backgroundColor: C.ink, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: C.lineStrong, paddingHorizontal: 20, paddingBottom: 12 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineStrong, marginTop: 8, marginBottom: 14 },
  sheetTitle: { color: C.paper, fontSize: 18, fontWeight: "800" },
  sheetMessage: { color: C.textDim, fontSize: 14, lineHeight: 20, marginTop: 6 },
  sheetAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", minHeight: 52, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  sheetActionPrimary: { backgroundColor: C.volt, borderColor: C.volt },
  sheetActionDanger: { backgroundColor: "rgba(255,239,179,0.08)", borderColor: "rgba(255,239,179,0.35)" },
  sheetCancel: { backgroundColor: "transparent", borderColor: "transparent" },
  sheetActionText: { color: C.paper, fontSize: 15.5, fontWeight: "800" },
});
