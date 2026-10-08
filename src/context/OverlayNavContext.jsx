import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { supabase } from "../../lib/supabase";
import { isConversationUnread } from "../utils/format";
import { useAuth } from "./AuthContext";

const OverlayNavContext = createContext(null);

// A Realtime notifications event that represents a new arrival.
export function isFreshUnread(payload, now = Date.now()) {
  const row = payload?.new;
  if (!row || row.is_read) return false;
  if (payload.eventType === "INSERT") return true;
  return payload.eventType === "UPDATE" && Math.abs(now - new Date(row.created_at).getTime()) < 30 * 1000;
}

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

  // The banner checks which overlay is open through a ref, so the Realtime
  // subscription below doesn't have to be torn down and re-created (losing
  // events in between) every time an overlay opens or closes.
  const viewRef = useRef({ notificationView, chatView });
  useEffect(() => { viewRef.current = { notificationView, chatView }; }, [notificationView, chatView]);

  const triggerBanner = useCallback((notification) => {
    if (!notification || notification.is_read) return;
    const view = viewRef.current;
    if (view.notificationView) return;
    if (view.chatView && typeof view.chatView === "object" && view.chatView.id === notification.related_id) return;
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setActiveBanner(notification);
    bannerTimerRef.current = setTimeout(() => {
      setActiveBanner(null);
    }, 6000);
  }, []);

  useEffect(() => () => clearTimeout(bannerTimerRef.current), []);

  const closeOverlays = useCallback(() => {
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
  }, []);

  const hasOverlay = Boolean(detail || chatView || notificationView || adminView);

  // Steps back one level, mirroring each overlay's own on-screen back arrow
  // (see AppOverlays). Returns false when nothing was open.
  const goBack = useCallback(() => {
    if (notificationView) setNotificationView(false);
    else if (adminView) setAdminView(false);
    else if (chatView && chatView !== "list") setChatView("list");
    else if (chatView) setChatView(null);
    else if (detail) setDetail(null);
    else return false;
    return true;
  }, [notificationView, adminView, chatView, detail]);

  // Android hardware/gesture back. While the overlay Modal is showing, Android
  // routes back presses to the Modal's onRequestClose instead (which also calls
  // goBack), so this mainly covers the moment the Modal is closing.
  useEffect(() => {
    if (!hasOverlay) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => subscription.remove();
  }, [hasOverlay, goBack]);

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
        // Message notifications are one row per conversation, re-armed with an
        // UPDATE (is_read back to false, fresh created_at) for each new message,
        // so a just-created unread row counts as new whether it was inserted
        // or updated. Mark-read updates (is_read true) never show a banner.
        if (isFreshUnread(payload)) triggerBanner(payload.new);
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
    goBack,
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
