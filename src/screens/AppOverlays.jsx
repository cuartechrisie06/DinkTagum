import React from "react";
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor } from "../utils/format";
import { AdminTab } from "./AdminTab";
import { ChatList, ChatThread } from "./ChatScreens";
import { CourtDetail } from "./CourtDetail";
import { NotificationCenter } from "./NotificationCenter";
import { C, Icon } from "./shared";

function InAppNotificationBanner({ banner, onDismiss, onPress }) {
  if (!banner) return null;

  const iconName =
    banner.kind === "message"
      ? "chatbubble-ellipses"
      : banner.kind === "reservation"
      ? "calendar"
      : banner.kind === "connection"
      ? "person-add"
      : banner.kind === "game_invitation"
      ? "tennisball"
      : banner.kind === "community"
      ? "people"
      : "notifications";

  return (
    <SafeAreaView edges={["top"]} style={bannerStyles.wrapper} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onPress(banner)}
        style={bannerStyles.container}
        accessibilityRole="button"
        accessibilityLabel={`New notification: ${banner.title}. Tap to open.`}
      >
        <View style={bannerStyles.iconContainer}>
          <Icon name={iconName} size={18} color={C.volt} />
        </View>
        <View style={bannerStyles.textContainer}>
          <Text style={bannerStyles.title} numberOfLines={1}>{banner.title}</Text>
          {banner.body ? <Text style={bannerStyles.body} numberOfLines={1}>{banner.body}</Text> : null}
          <Text style={bannerStyles.actionHint}>
            {banner.kind === "message" ? "Tap to open chat" : "Tap to view"}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={bannerStyles.closeBtn}
          accessibilityLabel="Dismiss notification"
        >
          <Icon name="close" size={16} color={C.textDim} />
        </TouchableOpacity>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

export function AppOverlays() {
  const router = useRouter();
  const { session } = useAuth();
  const { createReservation, reserving, loadBusySlots } = useDashboard();
  const {
    detail,
    setDetail,
    chatView,
    setChatView,
    notificationView,
    setNotificationView,
    adminView,
    setAdminView,
    activeBanner,
    dismissBanner,
  } = useOverlayNav();

  if (!session) return null;

  const openConversation = async (conversationId) => {
    // Always close notification overlay so the chat screen is visible
    setNotificationView(false);

    if (!conversationId) {
      setChatView("list");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("list_my_conversations");
      if (!error && Array.isArray(data)) {
        const match = data.find((c) => c.conversation_id === conversationId);
        if (match) {
          const name = match.other_display_name || "DinkTagum player";
          setChatView({ id: conversationId, name, initials: initialsFor(name), avatarUrl: match.other_avatar_url });
          return;
        }
      }

      // Direct fallback query if list_my_conversations is missing or conversation is new
      if (supabase) {
        const { data: convo } = await supabase
          .from("conversations")
          .select("id, user_a, user_b")
          .eq("id", conversationId)
          .maybeSingle();

        if (convo) {
          const otherId = convo.user_a === session.user.id ? convo.user_b : convo.user_a;
          const { data: prof } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", otherId)
            .maybeSingle();

          const name = prof?.display_name || "DinkTagum player";
          setChatView({ id: conversationId, name, initials: initialsFor(name), avatarUrl: prof?.avatar_url });
          return;
        }
      }
    } catch (e) {
      console.warn("Could not resolve conversation:", e);
    }

    // Default fallback to direct to the conversation thread
    setChatView({ id: conversationId, name: "Player", initials: "DT", avatarUrl: null });
  };

  const handleNavigate = (route) => {
    setNotificationView(false);
    if (route) {
      router.push(route);
    }
  };

  const handleBannerPress = async (banner) => {
    dismissBanner();
    if (supabase && banner.id) {
      void supabase.from("notifications").update({ is_read: true }).eq("id", banner.id);
    }

    if (banner.kind === "message") {
      openConversation(banner.related_id);
    } else if (banner.kind === "reservation") {
      handleNavigate("/history");
    } else if (banner.kind === "connection" || banner.kind === "game_invitation") {
      handleNavigate("/directory");
    } else if (banner.kind === "community") {
      handleNavigate("/feed");
    } else {
      setNotificationView(true);
    }
  };

  let content = null;
  if (notificationView) {
    content = (
      <NotificationCenter
        user={session.user}
        onBack={() => setNotificationView(false)}
        onOpenConversation={openConversation}
        onNavigate={handleNavigate}
      />
    );
  } else if (adminView) {
    content = <AdminTab user={session.user} onBack={() => setAdminView(false)} />;
  } else if (chatView === "list") {
    content = <ChatList onBack={() => setChatView(null)} openThread={(c) => setChatView(c)} />;
  } else if (chatView) {
    content = <ChatThread convo={chatView} onBack={() => setChatView("list")} />;
  } else if (detail) {
    content = (
      <CourtDetail
        court={detail}
        onBack={() => setDetail(null)}
        reserve={createReservation}
        reserving={reserving}
        loadBusySlots={loadBusySlots}
      />
    );
  }

  return (
    // On native, react-native-screens' tab container can draw above a plain
    // absolutely-positioned sibling, hiding the overlay behind the current tab.
    // An explicit zIndex (iOS) and elevation (Android) keeps it on top.
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 1000, elevation: 1000 }]} pointerEvents="box-none">
      {content ? (
        <View style={{ flex: 1, backgroundColor: C.ink }}>
          <StatusBar barStyle="light-content" />
          {content}
        </View>
      ) : null}
      <InAppNotificationBanner
        banner={activeBanner}
        onDismiss={dismissBanner}
        onPress={handleBannerPress}
      />
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: Platform.OS === "android" ? 10 : 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F3E33",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "rgba(227, 239, 38, 0.45)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#06231D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 251, 206, 0.2)",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: "#FFFDEE",
    fontSize: 13.5,
    fontWeight: "700",
  },
  body: {
    color: "rgba(255, 253, 238, 0.75)",
    fontSize: 12,
    marginTop: 2,
  },
  actionHint: {
    color: "#E3EF26",
    fontSize: 10.5,
    fontWeight: "700",
    marginTop: 3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 8,
    marginLeft: 6,
  },
});
