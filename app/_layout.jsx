import "react-native-gesture-handler";
import { ActivityIndicator, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Tabs } from "expo-router";
import { AppErrorBoundary, AppShell, appTheme } from "../src/components/AppShell";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { DashboardProvider } from "../src/context/DashboardContext";
import { CommunityFeedProvider } from "../src/context/CommunityFeedContext";
import { GameRecordsProvider } from "../src/context/GameRecordsContext";
import { OpenPlayProvider } from "../src/context/OpenPlayContext";
import { OverlayNavProvider, useOverlayNav } from "../src/context/OverlayNavContext";
import { TabBar } from "../src/components/TabBar";
import { BiometricLock } from "../src/components/BiometricLock";
import { AppOverlays } from "../src/screens/AppOverlays";
import { AuthScreen, ResetPasswordScreen } from "../src/screens/AuthScreen";
import { SheetHost, ToastHost } from "../src/components/Feedback";

function SignedInApp() {
  const { hasOverlay } = useOverlayNav();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        backBehavior="history"
        tabBar={(props) => <TabBar {...props} hidden={hasOverlay} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: appTheme.background } }}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="courts" options={{ title: "Courts" }} />
        <Tabs.Screen name="feed" options={{ title: "Feed" }} />
        {/* Not in the dock (5 tabs max): opened from Profile → "Matches & bookings",
            Home's "Log match", and reservation/match notifications. /history
            still works as a link. */}
        <Tabs.Screen name="history" options={{ title: "History", href: null }} />
        <Tabs.Screen name="directory" options={{ title: "Players" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
      </Tabs>
      <AppOverlays />
    </View>
  );
}

function RootNavigator() {
  const { authReady, session, passwordRecovery } = useAuth();

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.background }}>
        <ActivityIndicator color={appTheme.primary} />
        <Text style={{ color: appTheme.text, marginTop: 12 }}>Loading DinkTagum...</Text>
      </View>
    );
  }

  // A password-recovery link signs the user into a session scoped only for
  // setting a new password (see AuthContext), so it's checked before the
  // normal signed-in branch even though `session` is already truthy here.
  if (passwordRecovery) return <ResetPasswordScreen />;

  if (!session) return <AuthScreen />;

  // Keyed by user id: signing out (or switching accounts) remounts these providers
  // from scratch instead of needing to manually reset each one's state.
  // BiometricLock: a session restored at launch waits for fingerprint / Face
  // ID when the player turned that on (see src/utils/biometric.js).
  return (
    <BiometricLock key={session.user.id}>
      <DashboardProvider key={session.user.id}>
        <CommunityFeedProvider key={session.user.id}>
          <GameRecordsProvider key={session.user.id}>
            <OpenPlayProvider key={session.user.id}>
              <OverlayNavProvider key={session.user.id}>
                <SignedInApp />
              </OverlayNavProvider>
            </OpenPlayProvider>
          </GameRecordsProvider>
        </CommunityFeedProvider>
      </DashboardProvider>
    </BiometricLock>
  );
}

export default function RootLayout() {
  // Preload the icon font once so icons don't pop in (or each trigger their own
  // load). A failed load is non-fatal: the app still renders without it.
  const [fontsLoaded, fontError] = useFonts(Ionicons.font);
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: appTheme.background }} />;
  }

  return (
    <AppShell>
      <AppErrorBoundary>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
        {/* Toasts and bottom sheets for notify()/confirmAction() (utils/confirm). */}
        <ToastHost />
        <SheetHost />
      </AppErrorBoundary>
    </AppShell>
  );
}
