import React from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { KIND_ICONS, NotificationCenter, notificationRoute } from "./NotificationCenter";
import { C, Icon, ScreenFrame } from "./shared";
import { ToastHost } from "../components/Feedback";

function InAppNotificationBanner({ banner, onDismiss, onPress }) {
  if (!banner) return null;

  const iconName = KIND_ICONS[banner.kind] || "notifications";

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
    goBack,
    closeOverlays,
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

  // Close every overlay first: a court page or chat left open would sit on
  // top of the screen we navigate to, so the tap looked like it did nothing.
  const handleNavigate = (route) => {
    closeOverlays();
    if (route) router.navigate(route);
  };

  const handleBannerPress = async (banner) => {
    dismissBanner();
    if (supabase && banner.id) {
      // Awaited via .then(): Supabase queries don't run until then'd.
      supabase.from("notifications").update({ is_read: true }).eq("id", banner.id).then(() => {});
    }

    if (banner.kind === "message") {
      openConversation(banner.related_id);
    } else if (banner.kind === "system") {
      setNotificationView(true);
    } else {
      handleNavigate(notificationRoute(banner.kind));
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


  const banner = <InAppNotificationBanner banner={activeBanner} onDismiss={dismissBanner} onPress={handleBannerPress} />;

  return (
    <>
      {/* Overlays render in a Modal, not an absolutely-positioned View over
          <Tabs>. On Android the tab screens live in native react-native-screens
          containers, which drew over that View even with zIndex/elevation, so
          taps updated state but the screen opened invisibly underneath. A Modal
          is its own native window above the activity, on every platform. */}
      <Modal
        visible={Boolean(content)}
        animationType="slide"
        onRequestClose={goBack}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <ScreenFrame>{content}</ScreenFrame>
        {content ? banner : null}
        {/* Toasts raised while an overlay is open must render in its window. */}
        {content ? <ToastHost /> : null}
      </Modal>
      {!content ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">{banner}</View>
      ) : null}
    </>
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
