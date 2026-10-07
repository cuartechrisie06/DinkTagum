import { Alert, Platform } from "react-native";
import { showSheet, showToast } from "../components/Feedback";

// Destructive confirmations show as a bottom sheet (see components/Feedback).
// The native dialogs are only a fallback for when no sheet host is mounted.
export function confirmAction(title, message, confirmLabel = "Delete") {
  return new Promise((resolve) => {
    const shown = showSheet({
      title,
      message,
      actions: [{ label: confirmLabel, icon: "checkmark", tone: "danger", onPress: () => resolve(true) }],
      onDismiss: () => resolve(false),
    });
    if (shown) return;
    if (Platform.OS === "web") {
      resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "destructive", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// Short status message as a toast. `tone` ("success" | "error" | "info") is
// inferred from the title when omitted ("Could not…" reads as an error).
export function notify(title, message, tone) {
  if (showToast({ title, message, tone })) return;
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

// A list of choices as a bottom sheet, e.g. Google Maps vs Waze.
// actions: [{ label, icon, onPress }]
export function chooseAction(title, message, actions) {
  if (showSheet({ title, message, actions: actions.map((a, i) => ({ tone: i === 0 ? "primary" : "default", ...a })) })) return;
  actions[0]?.onPress?.();
}
