import "react-native-gesture-handler";
import { ActivityIndicator, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { AppErrorBoundary, AppShell, appTheme } from "../src/components/AppShell";
import { AppDataProvider, useAppData } from "../src/context/AppDataContext";
import { AppOverlays, AuthScreen } from "../src/screens/DinkScreens";

const icons = { index: "⌂", courts: "⌖", feed: "✎", history: "◷", directory: "♙", profile: "◉" };

function RootNavigator() {
  const { authReady, session, hasOverlay } = useAppData();

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.background }}>
        <ActivityIndicator color={appTheme.primary} />
        <Text style={{ color: appTheme.text, marginTop: 12 }}>Loading DinkTagum...</Text>
      </View>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: appTheme.primary,
        tabBarInactiveTintColor: appTheme.mutedText,
        tabBarStyle: hasOverlay
          ? { display: "none" }
          : { backgroundColor: appTheme.card, borderTopColor: "rgba(226,251,206,0.14)" },
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>{icons[route.name] || "•"}</Text>,
      })}>
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="courts" options={{ title: "Courts" }} />
        <Tabs.Screen name="feed" options={{ title: "Feed" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
        <Tabs.Screen name="directory" options={{ title: "Directory" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
      <AppOverlays />
    </View>
  );
}

export default function RootLayout() {
  return (
    <AppShell>
      <AppErrorBoundary>
        <AppDataProvider>
          <RootNavigator />
        </AppDataProvider>
      </AppErrorBoundary>
    </AppShell>
  );
}
