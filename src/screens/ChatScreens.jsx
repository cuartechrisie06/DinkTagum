import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { clockTime, dayLabel, endsMessageGroup, initialsFor, isConversationUnread, relativeTime } from "../utils/format";
import { Avatar, BackButton, C, EmptyCard, ErrorNote, Icon, OverlayHeader, S, styles } from "./shared";

const MESSAGE_LIMIT = 50;

// Merges an incoming message (from our own insert response, or a realtime
// INSERT event) into the list without ever producing a duplicate: a message
// already present by its real id is skipped, and — when a clientId is given —
// the matching optimistic bubble is replaced in place rather than duplicated.
export function upsertMessage(current, incoming, clientId) {
  if (current.some((m) => m.id === incoming.id)) return current;
  if (clientId) {
    const index = current.findIndex((m) => m.clientId === clientId);
    if (index !== -1) {
      const next = current.slice();
      next[index] = incoming;
      return next;
    }
  }
  return [...current, incoming].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function ChatList({ onBack, openThread }) {
  const { session } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadConversations = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error: queryError } = await supabase.rpc("list_my_conversations");
      if (!active) return;
      if (queryError) setError(`Conversations could not be loaded: ${queryError.message}`);
      else { setConversations(data || []); setError(""); }
      setLoading(false);
    };
    loadConversations();
    if (!supabase) return () => { active = false; };
    // messages is in the supabase_realtime publication and RLS-scoped to rows the
    // caller can see, so this only ever fires for conversations we're part of.
    const channel = supabase.channel(`chat-list-${session.user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, loadConversations).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [session.user.id]);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom", "left", "right"]}>
      <OverlayHeader title="Chats" onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: S.xl, paddingTop: S.xs, paddingBottom: S.xl }}>
        {loading ? <ActivityIndicator color={C.volt} style={{ marginTop: 16 }} /> : conversations.length ? conversations.map((c) => {
          const name = c.other_display_name || "DinkTagum player";
          const unread = isConversationUnread(c, session.user.id);
          return (
            <TouchableOpacity
              key={c.conversation_id}
              onPress={() => openThread({ id: c.conversation_id, name, initials: initialsFor(name), avatarUrl: c.other_avatar_url })}
              style={styles.convoRow}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${name}${unread ? ", unread" : ""}`}
            >
              <Avatar initials={initialsFor(name)} uri={c.other_avatar_url} size={48} />
              <View style={{ flex: 1, marginLeft: S.md }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.convoName}>{name}</Text>
                  <Text style={styles.convoTime}>{c.last_message_created_at ? relativeTime(c.last_message_created_at) : ""}</Text>
                </View>
                <Text style={[styles.convoLast, { color: unread ? C.paper : C.textDim, fontWeight: unread ? "700" : "400" }]} numberOfLines={1}>
                  {c.last_message_body || "Say hello!"}
                </Text>
              </View>
              {unread && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          );
        }) : error ? null : <View style={{ marginTop: S.lg }}><EmptyCard icon="chatbubbles-outline" title="No conversations yet" message="Message a player from Find Players to start chatting." /></View>}
        <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>
      </ScrollView>
    </SafeAreaView>
  );
}

export function ChatThread({ convo, onBack }) {
  const { session } = useAuth();
  const scrollRef = useRef(null);
  // Set right before any state update that appends at the bottom (initial load,
  // sending, a realtime insert), so onContentSizeChange knows to scroll down.
  // Left false when older history is prepended, so that doesn't yank the view.
  const pendingBottomScrollRef = useRef(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  // When the other person last opened this chat, for "Seen" under my messages.
  const [otherLastRead, setOtherLastRead] = useState(null);

  useEffect(() => {
    if (!supabase) return undefined;
    const me = session.user.id;
    const applyRow = (row) => {
      if (!row) return;
      setOtherLastRead(row.user_a === me ? row.last_read_b : row.last_read_a);
    };
    supabase.from("conversations").select("user_a, user_b, last_read_a, last_read_b").eq("id", convo.id).maybeSingle().then(({ data }) => applyRow(data));
    const channel = supabase
      .channel(`conversation-read-${convo.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${convo.id}` }, (payload) => applyRow(payload.new))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [convo.id, session.user.id]);

  useEffect(() => {
    let active = true;
    const loadMessages = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("conversation_id", convo.id)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (!active) return;
      if (queryError) setError(`Messages could not be loaded: ${queryError.message}`);
      else {
        pendingBottomScrollRef.current = true;
        setMessages((data || []).slice().reverse());
        setHasMore((data || []).length === MESSAGE_LIMIT);
        setError("");
      }
      setLoading(false);
      supabase.rpc("mark_conversation_read", { p_conversation_id: convo.id });
    };
    loadMessages();

    const channel = supabase
      .channel(`messages-${convo.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convo.id}` },
        (payload) => {
          if (!active) return;
          pendingBottomScrollRef.current = true;
          setMessages((current) => upsertMessage(current, payload.new));
          if (payload.new.sender_id !== session.user.id) {
            supabase.rpc("mark_conversation_read", { p_conversation_id: convo.id });
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [convo.id, session.user.id]);

  const loadOlderMessages = async () => {
    if (!supabase || loadingMore || !hasMore || !messages.length) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const { data, error: queryError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, content, created_at")
      .eq("conversation_id", convo.id)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_LIMIT);
    setLoadingMore(false);
    if (queryError) { setError(`Older messages could not be loaded: ${queryError.message}`); return; }
    const older = (data || []).slice().reverse();
    setHasMore(older.length === MESSAGE_LIMIT);
    setMessages((current) => [...older, ...current]);
  };

  const send = async () => {
    const content = body.trim();
    if (!content || !supabase) return;
    const clientId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setBody("");
    pendingBottomScrollRef.current = true;
    setMessages((current) => [...current, {
      id: clientId,
      clientId,
      conversation_id: convo.id,
      sender_id: session.user.id,
      content,
      created_at: new Date().toISOString(),
      status: "sending",
    }]);
    const { data, error: sendError } = await supabase
      .from("messages")
      .insert({ conversation_id: convo.id, sender_id: session.user.id, content })
      .select("id, conversation_id, sender_id, content, created_at")
      .single();
    if (sendError) {
      setMessages((current) => current.map((m) => (m.clientId === clientId ? { ...m, status: "failed" } : m)));
      return;
    }
    setMessages((current) => upsertMessage(current, data, clientId));
  };

  const retry = (failedMessage) => {
    setBody(failedMessage.content);
    setMessages((current) => current.filter((m) => m.clientId !== failedMessage.clientId));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <SafeAreaView style={[styles.screen, { flex: 1 }]}>
        <View style={styles.overlayHeader}>
          <BackButton onPress={onBack} />
          <View style={{ marginLeft: S.md }}><Avatar initials={convo.initials} uri={convo.avatarUrl} size={38} /></View>
          <Text style={styles.threadName} numberOfLines={1}>{convo.name}</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 18 }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={() => {
            if (!pendingBottomScrollRef.current) return;
            pendingBottomScrollRef.current = false;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {!loading && hasMore ? (
            <TouchableOpacity onPress={loadOlderMessages} disabled={loadingMore} accessibilityRole="button" accessibilityLabel="Load earlier messages" style={{ alignSelf: "center", marginBottom: 12 }}>
              {loadingMore ? <ActivityIndicator color={C.volt} /> : <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700" }}>Load earlier messages</Text>}
            </TouchableOpacity>
          ) : null}
          {loading ? <ActivityIndicator color={C.volt} /> : messages.length ? messages.map((m, index) => {
            const mine = m.sender_id === session.user.id;
            const previous = messages[index - 1];
            const next = messages[index + 1];
            const newDay = !previous || dayLabel(previous.created_at) !== dayLabel(m.created_at);
            const isLastMine = mine && !messages.slice(index + 1).some((later) => later.sender_id === session.user.id);
            const seen = isLastMine && m.status !== "sending" && m.status !== "failed" && otherLastRead && new Date(otherLastRead) >= new Date(m.created_at);
            const showMeta = m.status !== "failed" && (endsMessageGroup(m, next) || isLastMine);
            return (
              <View key={m.id}>
                {newDay ? <Text style={chatStyles.dayDivider} accessibilityRole="header">{dayLabel(m.created_at)}</Text> : null}
                <View
                  style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, m.status === "sending" && { opacity: 0.6 }, showMeta && { marginBottom: 2 }]}
                  accessibilityLabel={`${mine ? "You" : convo.name}: ${m.content}, ${clockTime(m.created_at)}${isLastMine ? (seen ? ", seen" : ", sent") : ""}`}
                >
                  <Text style={[styles.bubbleText, { color: mine ? C.ink : C.paper }]}>{m.content}</Text>
                </View>
                {showMeta ? (
                  <Text style={[chatStyles.meta, { alignSelf: mine ? "flex-end" : "flex-start" }]}>
                    {m.status === "sending" ? "Sending…" : clockTime(m.created_at)}
                    {isLastMine && m.status !== "sending" ? (seen ? " · Seen" : " · Sent") : ""}
                  </Text>
                ) : null}
                {m.status === "failed" ? (
                  <TouchableOpacity onPress={() => retry(m)} accessibilityRole="button" accessibilityLabel="Message not sent, tap to retry" style={{ alignSelf: "flex-end", minHeight: 44, justifyContent: "center" }}>
                    <Text style={{ color: C.butter, fontSize: 12 }}>Not sent · Tap to retry</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }) : error ? null : <View style={{ alignItems: "center", marginTop: S.xxl }}><Avatar initials={convo.initials} uri={convo.avatarUrl} size={64} /><Text style={[styles.emptyTitle, { marginTop: S.md }]}>{convo.name}</Text><Text style={styles.emptyMessage}>Say hello to start the conversation.</Text></View>}
          <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>
        </ScrollView>
        <View style={styles.composeRow}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Message..."
            placeholderTextColor={C.textDim}
            style={styles.messageInput}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
          />
          <TouchableOpacity
            onPress={send}
            disabled={!body.trim()}
            style={[styles.sendBtn, !body.trim() && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Icon name="send" size={18} color={body.trim() ? C.ink : C.textFaint} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const chatStyles = StyleSheet.create({
  dayDivider: { alignSelf: "center", color: C.textDim, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", marginVertical: S.md },
  meta: { color: C.textFaint, fontSize: 11, marginBottom: S.sm, marginHorizontal: 4 },
});
