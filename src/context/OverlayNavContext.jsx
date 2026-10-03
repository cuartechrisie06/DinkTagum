import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { supabase } from "../../lib/supabase";
import { isConversationUnread } from "../utils/format";
import { useAuth } from "./AuthContext";

const OverlayNavContext = createContext(null);

// Mounted only while signed in (see app/_layout.jsx), keyed by user id, so signing out
// naturally discards any open overlay instead of needing an explicit reset.
export function OverlayNavProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;
  const [detail, setDetail] = useState(null);
  const [chatView, setChatView] = useState(null);
  const [notificationView, setNotificationView] = useState(false);
  const [adminView, setAdminView] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [activeBanner, setActiveBanner] = useState(null);
  const bannerTimerRef = useRef(null);

  const dismissBanner = useCallback(() => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setActiveBanner(null);
  }, []);

  const triggerBanner = useCallback((notification) => {
    if (!notification || notification.is_read) return;
    if (notificationView) return;
    if (chatView && typeof chatView === "object" && chatView.id === notification.related_id) return;
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setActiveBanner(notification);
    bannerTimerRef.current = setTimeout(() => {
      setActiveBanner(null);
    }, 6000);
  }, [notificationView, chatView]);

  const closeOverlays = useCallback(() => {
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
  }, []);

  const hasOverlay = Boolean(detail || chatView || notificationView || adminView);

  // Every overlay ("module") already has an on-screen back arrow, but Android's
  // hardware/gesture back button was never wired to any of them, so pressing it
  // fell through to the OS default (minimizing or exiting the app) instead of
  // closing whatever was open. This mirrors each overlay's own onBack handler
  // (see AppOverlays) so hardware back behaves the same as tapping the arrow.
  useEffect(() => {
    if (!hasOverlay) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (notificationView) setNotificationView(false);
      else if (adminView) setAdminView(false);
      else if (chatView && chatView !== "list") setChatView("list");
      else if (chatView) setChatView(null);
      else if (detail) setDetail(null);
      else return false;
      return true;
    });
    return () => subscription.remove();
  }, [hasOverlay, notificationView, adminView, chatView, detail]);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!supabase) return;
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).eq("is_read", false);
    setUnreadNotifications(count || 0);
  }, [userId]);

  const refreshUnreadMessages = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("list_my_conversations");
    setUnreadMessages((data || []).filter((c) => isConversationUnread(c, userId)).length);
  }, [userId]);

  // Feeds the Home header's bell/chat badges. Kept live via Realtime (both
  // tables are RLS-scoped to this user, so every event here is already ours)
  // and re-synced whenever the relevant overlay closes, since that's when
  // NotificationCenter/ChatThread just marked things read on the server.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- both set state after their awaits
    refreshUnreadNotifications();
    refreshUnreadMessages();
    if (!supabase) return undefined;
    const channel = supabase
      .channel(`overlay-badges-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
        refreshUnreadNotifications();
        if (payload?.eventType === "INSERT" && payload?.new) {
          triggerBanner(payload.new);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refreshUnreadMessages)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, refreshUnreadNotifications, refreshUnreadMessages, triggerBanner]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshUnreadNotifications sets state after its awaits
    if (!notificationView) refreshUnreadNotifications();
  }, [notificationView, refreshUnreadNotifications]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshUnreadMessages sets state after its awaits
    if (!chatView) refreshUnreadMessages();
  }, [chatView, refreshUnreadMessages]);

  const value = {
    detail,
    setDetail,
    chatView,
    setChatView,
    notificationView,
    setNotificationView,
    adminView,
    setAdminView,
    hasOverlay,
    closeOverlays,
    unreadNotifications,
    unreadMessages,
    activeBanner,
    dismissBanner,
  };

  return <OverlayNavContext.Provider value={value}>{children}</OverlayNavContext.Provider>;
}

export function useOverlayNav() {
  const value = useContext(OverlayNavContext);
  if (!value) throw new Error("useOverlayNav must be used within OverlayNavProvider");
  return value;
}
