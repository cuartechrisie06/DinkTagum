import React, { Component, createContext, useContext } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export const appTheme = {
  background: "#06231D",
  card: "#0C342C",
  primary: "#E3EF26",
  text: "#FFFDEE",
  mutedText: "rgba(255,253,238,0.62)",
  danger: "#FFEFB3",
};

const ThemeContext = createContext(appTheme);

export function AppShell({ children }) {
  return (
    <SafeAreaProvider>
      <ThemeContext.Provider value={appTheme}>{children}</ThemeContext.Provider>
    </SafeAreaProvider>
  );
}

export function useAppTheme() {
  return useContext(ThemeContext);
}

export function LoadingState({ label = "Loading…", fullScreen = true }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.center, fullScreen && styles.fullScreen]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.message, { color: theme.text }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title = "Nothing here yet", message, actionLabel, onAction }) {
  const theme = useAppTheme();
  return (
    <SafeAreaView style={[styles.center, styles.fullScreen]} edges={["bottom"]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={[styles.action, { backgroundColor: theme.primary }]}><Text style={styles.actionText}>{actionLabel}</Text></Pressable> : null}
    </SafeAreaView>
  );
}

export function RouteErrorState({ error, retry }) {
  return <EmptyState title="Something went wrong" message={error?.message || "This screen could not be displayed."} actionLabel="Try again" onAction={retry} />;
}

export class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return <RouteErrorState error={this.state.error} retry={this.reset} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: appTheme.background },
  center: { alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: "center" },
  action: { borderRadius: 12, marginTop: 20, paddingHorizontal: 16, paddingVertical: 11 },
  actionText: { color: appTheme.background, fontWeight: "700" },
});
