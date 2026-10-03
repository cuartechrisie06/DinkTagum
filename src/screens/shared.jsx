import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

export const C = {
  ink: "#06231D",
  surface: "#0C342C",
  surface2: "#0F3E33",
  brand: "#076653",
  volt: "#E3EF26",
  mist: "#E2FBCE",
  butter: "#FFEFB3",
  paper: "#FFFDEE",
  line: "rgba(226,251,206,0.12)",
  lineStrong: "rgba(226,251,206,0.22)",
  textDim: "rgba(255,253,238,0.66)",
  textFaint: "rgba(255,253,238,0.42)",
  voltSoft: "rgba(227,239,38,0.14)",
};

// Shared spacing / radius scale so every screen lines up on the same grid.
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const R = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };

export function profileName(profile, user) {
  return profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Player";
}

export function ScreenFrame({ children }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );
}

export function Icon({ name, size = 18, color = C.paper, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

export function StatusPill({ status }) {
  const map = {
    Available: { bg: C.voltSoft, fg: C.volt, dot: C.volt },
    Full: { bg: "rgba(255,239,179,0.14)", fg: C.butter, dot: C.butter },
    Closed: { bg: "rgba(255,253,238,0.08)", fg: C.textDim, dot: C.textFaint },
  };
  const s = map[status] ?? map.Available;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: s.dot }]} />
      <Text style={[styles.pillText, { color: s.fg }]}>{status}</Text>
    </View>
  );
}

export function Avatar({ initials, size = 40, ring, uri }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: C.brand,
      alignItems: "center", justifyContent: "center",
      borderWidth: ring ? 2 : 0, borderColor: C.volt,
      overflow: "hidden",
    }}>
      {uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} /> : <Text style={{ color: C.mist, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>}
    </View>
  );
}

export function SectionTitle({ children, action, onAction }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function IconBtn({ name, onPress, accessibilityLabel, variant = "solid", badge }) {
  const solid = variant === "solid";
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.iconBtn, !solid && styles.iconBtnGhost]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
    >
      <Icon name={name} size={19} color={solid ? C.ink : C.paper} />
      {badge ? <View style={styles.iconBadge} /> : null}
    </TouchableOpacity>
  );
}

export function Button({ label, onPress, disabled, loading, variant = "primary", icon, style, accessibilityLabel }) {
  const v = {
    primary: { box: styles.btnPrimary, text: styles.btnPrimaryText, fg: C.ink },
    secondary: { box: styles.btnSecondary, text: styles.btnSecondaryText, fg: C.mist },
    ghost: { box: styles.btnGhost, text: styles.btnSecondaryText, fg: C.mist },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [v.box, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }, style]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {icon ? <Icon name={icon} size={17} color={v.fg} style={{ marginRight: 7 }} /> : null}
          <Text style={v.text}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function BackButton({ onPress, label = "Go back" }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.backCircle} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}>
      <Icon name="chevron-back" size={20} color={C.paper} />
    </TouchableOpacity>
  );
}

// Back button for the tab screens. Tabs use backBehavior="history" (see
// app/_layout.jsx), so this returns to whichever tab was open before; with no
// history (e.g. a deep link straight into a tab) it falls back to Home.
export function TabBackButton() {
  const router = useRouter();
  return <BackButton onPress={() => (router.canGoBack() ? router.back() : router.navigate("/"))} />;
}

// Header for full-screen overlays (notifications, admin, chats).
export function OverlayHeader({ title, subtitle, onBack, right }) {
  return (
    <View style={styles.overlayHeader}>
      <BackButton onPress={onBack} />
      <View style={{ flex: 1, marginLeft: S.md }}>
        <Text style={styles.overlayTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitleText} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function EmptyCard({ icon = "sparkles-outline", title, message, children }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}><Icon name={icon} size={22} color={C.volt} /></View>
      {title ? <Text style={styles.emptyTitle}>{title}</Text> : null}
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function ErrorNote({ children, style }) {
  if (!children) return null;
  return (
    <View style={[styles.errorNote, style]}>
      <Icon name="alert-circle-outline" size={16} color={C.butter} />
      <Text style={styles.errorNoteText}>{children}</Text>
    </View>
  );
}

export function HeaderBar({ eyebrow, title, subtitle, onChat, onNotifications, chatBadge, notificationBadge, showBack }) {
  return (
    <View style={styles.headerRow}>
      {showBack ? <View style={{ marginRight: S.md }}><TabBackButton /></View> : null}
      <View style={{ flex: 1, paddingRight: S.md }}>
        {eyebrow ? <Text style={styles.headerEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle} accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <View style={styles.headerSubtitle}>
            <Icon name="location-outline" size={13} color={C.textDim} />
            <Text style={[styles.headerSubtitleText, { marginLeft: 4, marginTop: 0 }]} numberOfLines={1}>{subtitle}</Text>
          </View>
        ) : null}
      </View>
      {onChat || onNotifications ? (
        <View style={{ flexDirection: "row" }}>
          {onChat ? <IconBtn name="chatbubble-ellipses-outline" variant="ghost" onPress={onChat} badge={chatBadge} accessibilityLabel={chatBadge ? "Open chats, unread messages" : "Open chats"} /> : null}
          {onChat && onNotifications ? <View style={{ width: S.sm }} /> : null}
          {onNotifications ? <IconBtn name="notifications-outline" variant="ghost" onPress={onNotifications} badge={notificationBadge} accessibilityLabel={notificationBadge ? "Open notifications, unread" : "Open notifications"} /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function CourtCard({ c, onPress, compact }) {
  const photo = c.photoUrls?.[0];
  // When no distance has been calculated yet, show just the area name rather
  // than "Distance unavailable" which looks like an error on every card.
  const subtitle = c.dist && c.dist !== "Distance unavailable"
    ? `${c.area} · ${c.dist}`
    : c.area;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.courtCard, compact && { width: 232, marginRight: S.md }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, ${c.area}, ${c.status}, rated ${c.rating}`}
    >
      <View style={[styles.courtThumb, compact && { height: 96 }]}>
        {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} /> : (
          <LinearGradient colors={[C.brand, C.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}>
            <Icon name="tennisball" size={28} color="rgba(227,239,38,0.55)" />
          </LinearGradient>
        )}
        <View style={styles.courtThumbPill}><StatusPill status={c.status} /></View>
      </View>
      <View style={{ padding: S.md, paddingTop: S.sm + 2 }}>
        <Text style={styles.courtName} numberOfLines={1}>{c.name}</Text>
        <View style={styles.courtFooterRow}>
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <Icon name="location-outline" size={13} color={C.textDim} />
            <Text style={styles.courtSub} numberOfLines={1}>{subtitle}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Icon name="star" size={12} color={C.volt} />
            <Text style={styles.courtRating}>{Number(c.rating || 0).toFixed(1)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PostAction({ icon, label, onPress, color = C.textDim }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.postAction} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Icon name={icon} size={16} color={color} />
      <Text style={[styles.postActionText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// Authors can edit/delete their own post; everyone else can report it.
export function PostCard({ p, compact, isMine, onSave, onDelete, onReport, onToggleLike, onLoadComments, onAddComment, onDeleteComment }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text);
  const [saving, setSaving] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await onSave?.(draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const toggleComments = async () => {
    if (commentsOpen) { setCommentsOpen(false); return; }
    setCommentsOpen(true);
    if (comments === null && onLoadComments) {
      setLoadingComments(true);
      setComments(await onLoadComments(p.id));
      setLoadingComments(false);
    }
  };

  const submitComment = async () => {
    if (!commentDraft.trim() || !onAddComment) return;
    setPostingComment(true);
    const result = await onAddComment(p.id, commentDraft);
    setPostingComment(false);
    if (result.ok) {
      setComments((current) => [...(current || []), result.comment]);
      setCommentDraft("");
    }
  };

  const removeComment = async (comment) => {
    if (!onDeleteComment) return;
    if (await onDeleteComment(comment.id, p.id)) setComments((current) => current.filter((c) => c.id !== comment.id));
  };

  return (
    <View style={[styles.postCard, compact && { marginBottom: S.sm + 2 }]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar initials={p.initials} uri={p.avatarUrl} size={38} />
        <View style={{ marginLeft: S.md, flex: 1 }}>
          <Text style={styles.postName} numberOfLines={1}>{p.name}</Text>
          <Text style={styles.postTime}>{p.time}</Text>
        </View>
      </View>
      {editing ? (
        <View style={{ marginTop: S.md }}>
          <TextInput value={draft} onChangeText={setDraft} multiline maxLength={2000} autoFocus style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]} accessibilityLabel="Edit post" />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: S.sm, marginTop: S.sm }}>
            <Button variant="ghost" label="Cancel" onPress={() => { setDraft(p.text); setEditing(false); }} disabled={saving} />
            <Button variant="secondary" label="Save" onPress={save} loading={saving} disabled={!draft.trim()} />
          </View>
        </View>
      ) : <Text style={styles.postText} numberOfLines={compact ? 3 : undefined}>{p.text}</Text>}
      {!compact && p.photoUrls?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }}>
          {p.photoUrls.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={[styles.postPhoto, p.photoUrls.length === 1 && styles.postPhotoSingle]} />)}
        </ScrollView>
      ) : null}
      {!compact && !editing ? (
        <View style={styles.postActions}>
          {onToggleLike ? <PostAction icon={p.likedByMe ? "heart" : "heart-outline"} color={p.likedByMe ? C.volt : C.textDim} label={p.likeCount ? `${p.likeCount} Like${p.likeCount === 1 ? "" : "s"}` : "Like"} onPress={() => onToggleLike(p.id, p.likedByMe)} /> : null}
          {onLoadComments ? <PostAction icon="chatbubble-outline" label={p.commentCount ? `${p.commentCount} Comment${p.commentCount === 1 ? "" : "s"}` : "Comment"} onPress={toggleComments} /> : null}
          {isMine ? <>
            {onSave ? <PostAction icon="create-outline" label="Edit" onPress={() => { setDraft(p.text); setEditing(true); }} /> : null}
            {onDelete ? <PostAction icon="trash-outline" label="Delete" onPress={onDelete} /> : null}
          </> : onReport ? <PostAction icon="flag-outline" label="Report" onPress={onReport} /> : null}
        </View>
      ) : null}
      {!compact && commentsOpen ? (
        <View style={styles.commentSection}>
          {loadingComments ? <ActivityIndicator color={C.volt} style={{ marginTop: S.sm }} /> : (comments || []).map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Avatar initials={c.initials} uri={c.avatarUrl} size={28} />
              <View style={{ flex: 1, marginLeft: S.sm }}>
                <View style={styles.commentBubble}>
                  <Text style={styles.commentName}>{c.name}</Text>
                  <Text style={styles.commentText}>{c.body}</Text>
                </View>
                <Text style={styles.commentTime}>{c.time}</Text>
              </View>
              {onDeleteComment ? (
                <TouchableOpacity onPress={() => removeComment(c)} accessibilityRole="button" accessibilityLabel="Delete comment" hitSlop={6} style={{ padding: 4 }}>
                  <Icon name="close" size={14} color={C.textFaint} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
          {!loadingComments && comments && !comments.length ? <Text style={styles.commentEmpty}>No comments yet. Be the first to say something.</Text> : null}
          {onAddComment ? (
            <View style={styles.commentComposeRow}>
              <TextInput value={commentDraft} onChangeText={setCommentDraft} placeholder="Write a comment…" placeholderTextColor={C.textFaint} style={styles.commentInput} maxLength={1000} accessibilityLabel="Write a comment" />
              <TouchableOpacity onPress={submitComment} disabled={!commentDraft.trim() || postingComment} style={[styles.commentSendBtn, (!commentDraft.trim() || postingComment) && { opacity: 0.5 }]} accessibilityRole="button" accessibilityLabel="Post comment">
                {postingComment ? <ActivityIndicator color={C.ink} size="small" /> : <Icon name="send" size={14} color={C.ink} />}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * PostCardCompact — lightweight read-only card used on the Home screen.
 * Shows author, truncated post text, and a footer with like + comment counts
 * plus a "View post →" hint so users know the feed is tappable.
 */
export function PostCardCompact({ p, onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[styles.postCard, { marginBottom: S.md }]}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${p.name}: ${p.text}. Tap to open.`}
    >
      {/* Author row */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar initials={p.initials} uri={p.avatarUrl} size={36} />
        <View style={{ marginLeft: S.md, flex: 1 }}>
          <Text style={styles.postName} numberOfLines={1}>{p.name}</Text>
          <Text style={styles.postTime}>{p.time}</Text>
        </View>
      </View>
      {/* Body — capped at 3 lines */}
      <Text style={[styles.postText, { marginTop: S.sm }]} numberOfLines={3}>{p.text}</Text>
      {/* Footer: counts + view hint */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: S.md, borderTopWidth: 1, borderColor: C.line, paddingTop: S.sm }}>
        {p.likeCount > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: S.lg }}>
            <Icon name="heart" size={13} color={C.volt} />
            <Text style={[styles.postActionText, { color: C.textDim, marginLeft: 5 }]}>{p.likeCount}</Text>
          </View>
        ) : null}
        {p.commentCount > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginRight: S.lg }}>
            <Icon name="chatbubble-outline" size={13} color={C.textDim} />
            <Text style={[styles.postActionText, { color: C.textDim, marginLeft: 5 }]}>
              {p.commentCount} {p.commentCount === 1 ? "comment" : "comments"}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <Text style={{ color: C.volt, fontSize: 12.5, fontWeight: "700" }}>View post →</Text>
      </View>
    </TouchableOpacity>
  );
}

const card = { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ink },
  pill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingVertical: 4, borderRadius: R.pill },
  pillDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  pillText: { fontSize: 11.5, fontWeight: "700" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: C.paper, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  sectionAction: { color: C.volt, fontSize: 13, fontWeight: "700" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
  iconBtnGhost: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  iconBadge: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: C.volt, borderWidth: 1.5, borderColor: C.surface },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: S.xl, paddingTop: S.xl + 4 },
  headerEyebrow: { color: C.textDim, fontSize: 14, fontWeight: "600", marginBottom: 2 },
  headerTitle: { color: C.paper, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  headerSubtitle: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  headerSubtitleText: { color: C.textDim, fontSize: 13.5, marginTop: 2 },
  overlayHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.xl, paddingVertical: S.md, borderBottomWidth: 1, borderColor: C.line },
  overlayTitle: { color: C.paper, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  backCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },

  emptyCard: { ...card, borderStyle: "dashed", borderColor: C.lineStrong, borderRadius: R.lg, padding: S.xl, alignItems: "center" },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center", marginBottom: S.md },
  emptyTitle: { color: C.paper, fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyMessage: { color: C.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 4, textAlign: "center", maxWidth: 280 },
  errorNote: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "rgba(255,239,179,0.08)", borderRadius: R.sm, padding: S.md, marginHorizontal: S.xl, marginTop: S.md },
  errorNoteText: { color: C.butter, fontSize: 13, lineHeight: 18, marginLeft: S.sm, flex: 1 },

  btnPrimary: { minHeight: 52, paddingHorizontal: S.xl, borderRadius: R.md, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: C.ink, fontSize: 15.5, fontWeight: "800" },
  btnSecondary: { minHeight: 40, paddingHorizontal: S.lg, borderRadius: R.sm, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  btnGhost: { minHeight: 40, paddingHorizontal: S.lg, borderRadius: R.sm, borderWidth: 1, borderColor: C.lineStrong, alignItems: "center", justifyContent: "center" },
  btnSecondaryText: { color: C.mist, fontSize: 13.5, fontWeight: "700" },

  loginTitle: { color: C.paper, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  loginSub: { color: C.textDim, fontSize: 14.5, marginTop: 6 },
  label: { fontSize: 13, fontWeight: "700", color: C.mist, marginBottom: 7 },
  input: { backgroundColor: C.surface, color: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15 },
  inputFocused: { borderColor: C.volt },
  authNotice: { color: C.mist, fontSize: 13.5, lineHeight: 19, textAlign: "center", marginTop: S.lg },
  signupText: { textAlign: "center", fontSize: 14, color: C.textDim, marginTop: S.xl },

  reservationCard: { borderRadius: R.xl, padding: S.xl, marginHorizontal: S.xl, marginTop: S.xl, overflow: "hidden" },
  reservationLabel: { color: C.volt, fontSize: 11.5, fontWeight: "800", letterSpacing: 1 },
  reservationName: { color: C.paper, fontSize: 19, fontWeight: "800", marginTop: 6, letterSpacing: -0.3 },
  reservationTime: { color: C.mist, fontSize: 14, marginTop: 4, opacity: 0.85 },
  reservationIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(6,35,29,0.35)", alignItems: "center", justifyContent: "center" },
  emptyState: { color: C.textDim, fontSize: 13.5, lineHeight: 19, marginHorizontal: S.xl, marginTop: S.md },
  dataError: { color: C.butter, fontSize: 13, lineHeight: 18, marginHorizontal: S.xl, marginTop: S.md },

  quickActionsRow: { flexDirection: "row", paddingHorizontal: S.xl, marginTop: S.lg, gap: S.sm + 2 },
  quickAction: { flex: 1, ...card, borderRadius: R.lg, paddingVertical: S.lg, alignItems: "center" },
  quickActionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center" },
  quickActionLabel: { fontSize: 12.5, fontWeight: "700", color: C.paper, marginTop: S.sm },
  locationMessage: { color: C.textDim, fontSize: 13, lineHeight: 18, marginTop: S.sm },
  mapDescription: { color: C.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 4 },

  courtCard: { ...card, borderRadius: R.lg, overflow: "hidden" },
  courtThumb: { height: 132, backgroundColor: C.brand, overflow: "hidden" },
  courtThumbPill: { position: "absolute", top: S.sm + 2, left: S.sm + 2, backgroundColor: "rgba(6,35,29,0.75)", borderRadius: R.pill },
  courtName: { color: C.paper, fontSize: 16, fontWeight: "700" },
  courtSub: { color: C.textDim, fontSize: 13, marginLeft: 3, flexShrink: 1 },
  courtRating: { color: C.paper, fontSize: 13, fontWeight: "700", marginLeft: 3 },
  courtFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 },

  postCard: { ...card, borderRadius: R.lg, padding: S.lg },
  postName: { color: C.paper, fontSize: 15, fontWeight: "700" },
  postTime: { color: C.textFaint, fontSize: 12.5, marginTop: 1 },
  postText: { color: C.paper, fontSize: 15, lineHeight: 22, marginTop: S.md },
  postActions: { flexDirection: "row", alignItems: "center", marginTop: S.md, borderTopWidth: 1, borderColor: C.line, paddingTop: S.md },
  postAction: { flexDirection: "row", alignItems: "center", marginRight: S.xl, paddingVertical: 2 },
  postActionText: { color: C.textDim, fontSize: 13, fontWeight: "600", marginLeft: 6 },
  postPhoto: { width: 200, height: 150, borderRadius: R.md, marginRight: S.sm, backgroundColor: C.surface2 },
  postPhotoSingle: { width: 300, height: 200 },

  commentSection: { marginTop: S.md, borderTopWidth: 1, borderColor: C.line, paddingTop: S.md },
  commentRow: { flexDirection: "row", marginTop: S.sm },
  commentBubble: { backgroundColor: C.surface2, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.sm },
  commentName: { color: C.paper, fontSize: 12.5, fontWeight: "700" },
  commentText: { color: C.mist, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  commentTime: { color: C.textFaint, fontSize: 11, marginTop: 3, marginLeft: 2 },
  commentEmpty: { color: C.textFaint, fontSize: 13, marginTop: S.sm },
  commentComposeRow: { flexDirection: "row", alignItems: "center", marginTop: S.md },
  commentInput: { flex: 1, backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 9, color: C.paper, fontSize: 13.5, marginRight: S.sm },
  commentSendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },

  chip: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.pill, paddingHorizontal: S.lg, paddingVertical: S.sm, marginRight: S.sm },
  chipActive: { backgroundColor: C.volt, borderColor: C.volt },
  chipText: { color: C.mist, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: C.ink },
  searchField: { flexDirection: "row", alignItems: "center", ...card, borderRadius: R.md, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: C.paper, fontSize: 15, paddingVertical: 12, marginLeft: S.sm },

  detailHero: { height: 240, backgroundColor: C.brand, overflow: "hidden" },
  detailBack: { position: "absolute", top: S.lg, left: S.lg },
  detailName: { color: C.paper, fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
  detailSub: { color: C.textDim, fontSize: 14, marginLeft: 4 },
  courtInfoCard: { ...card, borderRadius: R.lg, padding: S.lg, marginTop: S.lg },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: S.sm },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center", marginRight: S.md },
  courtInfoLabel: { color: C.textFaint, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.8 },
  courtInfoText: { color: C.paper, fontSize: 14.5, lineHeight: 20, marginTop: 2 },
  courtGalleryImage: { width: 200, height: 136, borderRadius: R.md, marginRight: S.sm + 2, backgroundColor: C.surface2 },
  statRow: { flexDirection: "row", marginTop: S.lg, gap: S.sm },
  statBox: { flex: 1, ...card, borderRadius: R.md, paddingVertical: S.md, alignItems: "center" },
  statText: { color: C.paper, fontSize: 13, fontWeight: "600", marginTop: 6, textAlign: "center" },
  amenitiesRow: { flexDirection: "row", flexWrap: "wrap", marginTop: S.lg, gap: S.sm },
  amenityPill: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface2, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 6 },
  amenityText: { color: C.mist, fontSize: 13, marginLeft: 5 },
  dateChip: { flex: 1, ...card, borderRadius: R.md, paddingVertical: S.md, alignItems: "center" },
  dateChipText: { color: C.paper, fontSize: 14, fontWeight: "700" },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: S.md, justifyContent: "space-between" },
  slotBtn: { width: "31.5%", borderWidth: 1, borderRadius: R.sm, paddingVertical: S.md, alignItems: "center", marginBottom: S.sm },
  slotText: { fontSize: 13.5, fontWeight: "700" },
  bookingBar: { paddingHorizontal: S.xl, paddingTop: S.md, paddingBottom: S.xl, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.ink },

  playerRow: { ...card, borderRadius: R.lg, padding: S.lg, marginBottom: S.md },
  playerName: { color: C.paper, fontSize: 16, fontWeight: "700" },
  playerSub: { color: C.textDim, fontSize: 13, marginTop: 3 },
  levelBadge: { backgroundColor: C.volt, borderRadius: R.sm, paddingHorizontal: S.sm, paddingVertical: 3 },
  levelBadgeText: { color: C.ink, fontSize: 12.5, fontWeight: "800" },
  playerActions: { flexDirection: "row", gap: S.sm, marginTop: S.md },

  composeCard: { ...card, borderRadius: R.lg, padding: S.md },
  composeInput: { flex: 1, color: C.paper, fontSize: 15, marginLeft: S.md, minHeight: 40, maxHeight: 120, paddingTop: 10 },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.sm, borderTopWidth: 1, borderColor: C.line, paddingTop: S.sm },

  notificationCard: { ...card, flexDirection: "row", borderRadius: R.lg, padding: S.lg, marginBottom: S.sm + 2 },
  notificationUnread: { borderColor: "rgba(227,239,38,0.45)", backgroundColor: C.surface2 },
  notificationKind: { color: C.volt, textTransform: "uppercase", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  notificationTitle: { color: C.paper, fontSize: 15, fontWeight: "700", marginTop: 4 },
  notificationBody: { color: C.textDim, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  notificationTime: { color: C.textFaint, fontSize: 12, marginTop: S.sm },
  adminGrid: { flexDirection: "row", gap: S.sm },
  adminStatCard: { flex: 1, ...card, borderRadius: R.md, paddingVertical: 14, alignItems: "center" },
  adminIntro: { color: C.textDim, fontSize: 13.5, lineHeight: 19, marginTop: S.lg },
  adminAction: { ...card, flexDirection: "row", alignItems: "center", borderRadius: R.md, padding: 14, marginTop: S.sm + 2 },
  adminActionTitle: { color: C.paper, fontSize: 14.5, fontWeight: "700" },
  adminActionHint: { color: C.textDim, fontSize: 12.5, marginTop: 3 },

  profileHero: { alignItems: "center", paddingHorizontal: S.xl, paddingTop: S.sm },
  profileName: { color: C.paper, fontSize: 24, fontWeight: "800", marginTop: 14, letterSpacing: -0.4 },
  profileSub: { color: C.textDim, fontSize: 13.5, marginTop: 4 },
  profileForm: { ...card, width: "100%", marginTop: S.lg, borderRadius: R.lg, padding: S.lg, gap: S.sm + 2 },
  profileInput: { width: "100%", backgroundColor: C.ink, color: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: R.sm + 2, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  profileFieldLabel: { color: C.mist, fontSize: 13, fontWeight: "700", marginTop: 4 },
  profileHint: { color: C.textDim, fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  visibilityRow: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: 2 },
  skillBadge: { flexDirection: "row", alignItems: "center", backgroundColor: C.voltSoft, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 6, marginTop: S.md },
  skillBadgeText: { color: C.volt, fontSize: 13, fontWeight: "700", marginLeft: 6 },
  statsGrid: { flexDirection: "row", paddingHorizontal: S.xl, marginTop: S.xl, gap: S.sm },
  statCard: { flex: 1, ...card, borderRadius: R.md, paddingVertical: 14, alignItems: "center" },
  statValue: { color: C.volt, fontSize: 20, fontWeight: "800" },
  statLabel: { color: C.textDim, fontSize: 11.5, marginTop: 3, textAlign: "center" },
  trendText: { color: C.textDim, fontSize: 13.5, marginTop: 4 },
  chart: { flexDirection: "row", height: 120, marginTop: S.md, ...card, borderRadius: R.lg, padding: 14 },
  chartCol: { flex: 1, alignItems: "center", marginHorizontal: 3 },
  chartLabel: { color: C.textDim, fontSize: 11.5, fontWeight: "700", marginTop: 6 },
  matchRow: { flexDirection: "row", alignItems: "center", ...card, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: S.md, marginBottom: S.sm },
  matchResult: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: S.md },
  matchVs: { color: C.paper, fontSize: 14.5, fontWeight: "600" },
  matchScore: { fontSize: 16, fontWeight: "800" },

  convoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderColor: C.line },
  convoName: { color: C.paper, fontSize: 15.5, fontWeight: "700", flexShrink: 1 },
  convoTime: { color: C.textFaint, fontSize: 12, marginLeft: S.sm },
  convoLast: { fontSize: 14, marginTop: 3 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.volt, marginLeft: S.sm },

  threadName: { color: C.paper, fontSize: 16.5, fontWeight: "700", marginLeft: S.sm + 2, flexShrink: 1 },
  bubble: { maxWidth: "80%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: S.sm },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: C.volt, borderBottomRightRadius: 5 },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: C.surface2, borderBottomLeftRadius: 5 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  composeRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: S.lg, paddingVertical: S.md, borderTopWidth: 1, borderColor: C.line },
  messageInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 22, paddingHorizontal: S.lg, paddingVertical: 11, marginRight: S.sm, fontSize: 15, color: C.paper, maxHeight: 110 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
});
