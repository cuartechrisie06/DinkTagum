import React, { useEffect, useState } from "react";
import { ActivityIndicator, SectionList, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { groupByRecency, relativeTime } from "../utils/format";
import { C, EmptyCard, ErrorNote, Icon, IconBtn, OverlayHeader, S, styles } from "./shared";
import { notify } from "../utils/confirm";
import { dedupeNotifications } from "../utils/notifications";

// Shared with the in-app banner (AppOverlays) so both route the same way.
export const KIND_ICONS = { message: "chatbubble-ellipses", reservation: "calendar", game_invitation: "tennisball", community: "people", system: "information-circle", connection: "person-add", open_play: "people-circle", match: "shield-checkmark" };

const KIND_LABELS = { game_invitation: "game invite", open_play: "open play", match: "match result" };

const KIND_HINTS = {
  message: " · Tap to open chat",
  reservation: " · Tap to view reservation",
  game_invitation: " · Tap to view players",
  connection: " · Tap to view players",
  community: " · Tap to view feed",
  open_play: " · Tap to view open games",
  match: " · Tap to view matches",
};

// Where a non-message notification takes the player.
export function notificationRoute(kind) {
  if (kind === "reservation" || kind === "match") return "/history";
  if (kind === "connection" || kind === "game_invitation") return "/directory";
  if (kind === "community") return "/feed";
  return "/";
}

export function NotificationCenter({ user, onBack, onOpenConversation, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      if (!supabase || !user?.id) return;
      setLoading(true);
      const { data, error: queryError } = await supabase.from("notifications").select("id, kind, title, body, related_id, is_read, created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (queryError) setError("Notifications could not be loaded. Confirm migrations are applied, then try again.");
      else { setNotifications(data || []); setError(""); }
      setLoading(false);
    };
    loadNotifications();
    if (!supabase || !user?.id) return () => { active = false; };
    // notifications is RLS-scoped to recipient_id = auth.uid(), so this only
    // ever fires for this user's own rows.
    const channel = supabase.channel(`notifications-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, loadNotifications).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [user?.id]);

  // Identical repeats (e.g. old "Reservation received" rows) show once.
  const visible = dedupeNotifications(notifications);

  const markRead = async (notification) => {
    if (notification.is_read || !supabase) return;
    const ids = notification.ids || [notification.id];
    const { error: updateError } = await supabase.from("notifications").update({ is_read: true }).in("id", ids).eq("recipient_id", user.id);
    if (updateError) { notify("Could not update notification", updateError.message); return; }
    setNotifications((current) => current.map((item) => (ids.includes(item.id) ? { ...item, is_read: true } : item)));
  };

  const unreadCount = visible.filter((item) => !item.is_read).length;
  const markAllRead = async () => {
    if (!supabase || !unreadCount) return;
    const { error: updateError } = await supabase.from("notifications").update({ is_read: true }).eq("recipient_id", user.id).eq("is_read", false);
    if (updateError) { notify("Could not update notifications", updateError.message); return; }
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
  };

  const openNotification = (notification) => {
    markRead(notification);
    if (notification.kind === "message") {
      if (onOpenConversation) {
        onOpenConversation(notification.related_id);
      }
    } else if (onNavigate) {
      onNavigate(notificationRoute(notification.kind));
    } else {
      onBack?.();
    }
  };

  return (
    <View style={styles.screen}>
    <OverlayHeader
      title="Notifications"
      subtitle={unreadCount ? `${unreadCount} unread` : "Updates about your games and reservations"}
      onBack={onBack}
      right={unreadCount ? <IconBtn name="checkmark-done" variant="ghost" onPress={markAllRead} accessibilityLabel="Mark all read" /> : null}
    />
    <SectionList
      style={styles.screen}
      contentContainerStyle={{ padding: S.xl, paddingTop: S.sm, paddingBottom: 32 }}
      sections={loading ? [] : groupByRecency(visible)}
      keyExtractor={(notification) => notification.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => (
        <Text style={{ color: C.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: S.md, marginBottom: S.sm }} accessibilityRole="header">{section.title}</Text>
      )}
      renderItem={({ item: notification }) => (
        <TouchableOpacity
          onPress={() => openNotification(notification)}
          style={[styles.notificationCard, !notification.is_read && styles.notificationUnread]}
          accessibilityRole="button"
          accessibilityLabel={`${notification.title}${notification.is_read ? "" : ", unread"}${KIND_HINTS[notification.kind] || ""}`}
        >
          <View style={[styles.infoIcon, { width: 38, height: 38, borderRadius: 19 }]}>
            <Icon name={KIND_ICONS[notification.kind] || "notifications"} size={18} color={C.volt} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={styles.notificationKind}>{KIND_LABELS[notification.kind] || notification.kind.replace(/_/g, " ")}</Text>
              {!notification.is_read ? <View style={[styles.unreadDot, { marginLeft: 0 }]} /> : null}
            </View>
            <Text style={styles.notificationTitle}>{notification.title}</Text>
            {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
            <Text style={styles.notificationTime}>{relativeTime(notification.created_at)}{notification.is_read ? "" : (KIND_HINTS[notification.kind] || " · Tap to view")}</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={loading ? <ActivityIndicator color={C.volt} /> : error ? null : <EmptyCard icon="notifications-off-outline" title="You're all caught up" message="New updates about your games will show up here." />}
      ListFooterComponent={<ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>}
    />
    </View>
  );
}
