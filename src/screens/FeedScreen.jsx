import React, { useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useCommunityFeed } from "../context/CommunityFeedContext";
import { useGameRecords } from "../context/GameRecordsContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { composePostBody, REPORT_REASONS } from "../utils/community";
import { initialsFor } from "../utils/format";
import { chooseAction, confirmAction, notify, pickOption } from "../utils/confirm";
import { uploadImageAsync } from "../utils/uploadImage";
import { Avatar, Button, C, ChipScroller, EmptyCard, ErrorNote, FieldError, HeaderBar, Icon, PostCard, S, ScreenFrame, profileName, styles } from "./shared";

const POST_TYPE_OPTIONS = [
  { key: "text", label: "Post", icon: "create-outline" },
  { key: "photo", label: "Photo", icon: "image-outline" },
  { key: "checkin", label: "Check-in", icon: "location-outline" },
  { key: "match", label: "Match result", icon: "trophy-outline" },
];

const PLACEHOLDERS = {
  text: "How was your game today?",
  photo: "Add a caption (optional)",
  checkin: "Who's here? Looking for a game? (optional)",
  match: "Anything to add about the match? (optional)",
};

function matchLabel(game) {
  return `${game.result === "win" ? "W" : "L"} ${game.player_score}–${game.opponent_score} vs ${game.opponents}`;
}

function Composer({ user, profile, courts, courtTagsSupported, postTypesSupported, myMatches, createPost }) {
  const [type, setType] = useState("text");
  const [body, setBody] = useState("");
  const [taggedCourt, setTaggedCourt] = useState(null);
  const [pickingCourt, setPickingCourt] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [attachedPhotoUrl, setAttachedPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const match = myMatches.find((g) => g.id === matchId) || null;

  const chooseType = (next) => {
    setType(next);
    setError("");
    if (next === "checkin") setPickingCourt(!taggedCourt);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Photo access needed", "Allow photo access in your device settings to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: true, // uploadImageAsync reads the bytes from here (see utils/uploadImage)
    });
    if (result.canceled || !result.assets?.length) return;
    setUploadingPhoto(true);
    const { url, error: uploadError } = await uploadImageAsync("post-photos", user.id, result.assets[0]);
    setUploadingPhoto(false);
    if (uploadError) { notify("Upload failed", uploadError.message); return; }
    setAttachedPhotoUrl(url);
    // A photo attached to a plain post makes it a photo post.
    if (postTypesSupported && type === "text") setType("photo");
    setError("");
  };

  const submit = async () => {
    setSubmitting(true);
    const result = await createPost({
      type,
      body: composePostBody({ type, caption: body, court: taggedCourt, match }),
      photoUrls: attachedPhotoUrl ? [attachedPhotoUrl] : [],
      courtId: taggedCourt?.id || null,
      matchRecordId: type === "match" ? matchId : null,
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setBody(""); setAttachedPhotoUrl(null); setTaggedCourt(null); setPickingCourt(false); setMatchId(null); setType("text"); setError("");
  };

  return (
    <View style={styles.composeCard}>
      {postTypesSupported ? (
        <ChipScroller fadeColor={C.surface} contentContainerStyle={{ paddingLeft: 0, paddingRight: S.xl }} style={{ marginBottom: S.md }}>
          {POST_TYPE_OPTIONS.map((option) => (
            <TouchableOpacity key={option.key} onPress={() => chooseType(option.key)} style={[styles.chip, { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 40 }, type === option.key && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: type === option.key }} accessibilityLabel={`${option.label} post`}>
              <Icon name={option.icon} size={14} color={type === option.key ? C.ink : C.mist} />
              <Text style={[styles.chipText, type === option.key && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </ChipScroller>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Avatar initials={initialsFor(profileName(profile, user))} uri={profile?.avatar_url} size={38} />
        <TextInput value={body} onChangeText={(v) => { setBody(v); if (error) setError(""); }} maxLength={2000} multiline placeholder={PLACEHOLDERS[type]} placeholderTextColor={C.textFaint} style={styles.composeInput} accessibilityLabel="Share your game" accessibilityHint={error || undefined} />
      </View>

      {type === "match" ? (
        myMatches.length ? (
          <View style={{ marginTop: S.md }}>
            <Text style={styles.profileFieldLabel}>Which match?</Text>
            <ChipScroller fadeColor={C.surface} contentContainerStyle={{ paddingLeft: 0 }}>
              {myMatches.slice(0, 8).map((g) => (
                <TouchableOpacity key={g.id} onPress={() => { setMatchId(g.id); setError(""); }} style={[styles.chip, { minHeight: 40, justifyContent: "center" }, matchId === g.id && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: matchId === g.id }} accessibilityLabel={`Share match ${matchLabel(g)}`}>
                  <Text style={[styles.chipText, matchId === g.id && styles.chipTextActive]}>{matchLabel(g)}</Text>
                </TouchableOpacity>
              ))}
            </ChipScroller>
          </View>
        ) : <Text style={[styles.profileHint, { marginTop: S.md }]}>Log a match from Matches &amp; bookings first, then share it here.</Text>
      ) : null}

      {attachedPhotoUrl ? (
        <View style={{ marginTop: S.md, marginLeft: 50, alignSelf: "flex-start" }}>
          <Image source={{ uri: attachedPhotoUrl }} style={{ width: 120, height: 90, borderRadius: 12 }} />
          <TouchableOpacity onPress={() => setAttachedPhotoUrl(null)} style={feedStyles.removePhoto} accessibilityRole="button" accessibilityLabel="Remove attached photo" hitSlop={6}>
            <Icon name="close" size={14} color={C.paper} />
          </TouchableOpacity>
        </View>
      ) : null}
      {taggedCourt ? (
        <View style={feedStyles.tagChip}>
          <Icon name="location" size={13} color={C.volt} />
          <Text style={feedStyles.tagChipText} numberOfLines={1}>{type === "checkin" ? `Checking in at ${taggedCourt.name}` : taggedCourt.name}</Text>
          <TouchableOpacity onPress={() => setTaggedCourt(null)} style={feedStyles.tagRemove} accessibilityRole="button" accessibilityLabel={`Remove ${taggedCourt.name} tag`}>
            <Icon name="close" size={14} color={C.volt} />
          </TouchableOpacity>
        </View>
      ) : null}
      {pickingCourt && !taggedCourt ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.sm, flexGrow: 0 }} contentContainerStyle={{ gap: S.sm, paddingRight: S.xl }} keyboardShouldPersistTaps="handled">
          {courts.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => { setTaggedCourt(c); setPickingCourt(false); setError(""); }} style={[styles.chip, { marginRight: 0, minHeight: 40, justifyContent: "center" }]} accessibilityRole="button" accessibilityLabel={`Tag ${c.name}`}>
              <Text style={styles.chipText}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <FieldError message={error} />
      <View style={styles.composeFooter}>
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity disabled={uploadingPhoto} onPress={pickPhoto} style={feedStyles.attach} accessibilityRole="button" accessibilityLabel="Attach a photo">
            {uploadingPhoto ? <ActivityIndicator color={C.volt} size="small" /> : <Icon name="image-outline" size={20} color={C.volt} />}
            <Text style={feedStyles.attachText}>{uploadingPhoto ? "Uploading…" : "Photo"}</Text>
          </TouchableOpacity>
          {courtTagsSupported && courts.length ? (
            <TouchableOpacity onPress={() => setPickingCourt((v) => !v)} style={feedStyles.attach} accessibilityRole="button" accessibilityState={{ expanded: pickingCourt }} accessibilityLabel={taggedCourt ? `Tagged ${taggedCourt.name}` : "Tag a court"}>
              <Icon name="location-outline" size={20} color={C.volt} />
              <Text style={feedStyles.attachText}>Court</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Button label="Post" icon="send" onPress={submit} loading={submitting} disabled={uploadingPhoto} style={{ minHeight: 38, paddingHorizontal: S.lg }} accessibilityLabel="Publish post" />
      </View>
    </View>
  );
}

function FeedTab({ user, profile, posts, loading, error, feed, onRefresh, refreshing, courts, myMatches, onOpenCourt }) {
  const { createCommunityPost, updateCommunityPost, deleteCommunityPost, reportCommunityPost, moderatorDeletePost, blockUser, unblockUser, blockedIds, safetySupported, isAdmin, toggleLike, loadComments, addComment, deleteComment, hasMorePosts, loadingMorePosts, loadMorePosts, courtTagsSupported, postTypesSupported } = feed;
  const courtsById = Object.fromEntries(courts.map((c) => [c.id, c]));

  // Reason first, then a confirmation; the post disappears for the reporter.
  const report = async (p) => {
    const reason = await pickOption("Why are you reporting this?", "Admins review every report. You won't see this post anymore.", REPORT_REASONS.map((r) => ({ key: r.key, label: r.label, icon: "flag-outline" })));
    if (!reason) return;
    const label = REPORT_REASONS.find((r) => r.key === reason)?.label;
    if (await confirmAction("Report post?", `Reason: ${label}. An admin will review it.`, "Report")) reportCommunityPost(p.id, reason);
  };

  const block = async (p) => {
    if (await confirmAction(`Block ${p.name}?`, "You won't see their posts or comments. They aren't told, and you can unblock them from the bottom of the feed.", "Block")) {
      if (await blockUser(p.author_id)) notify(`Blocked ${p.name}`, "Their posts are hidden from your feed.", "success");
    }
  };

  const moderatorDelete = async (p) => {
    if (await confirmAction("Delete this post?", `As an admin you're removing ${p.name}'s post for everyone. They'll be notified.`, "Delete post")) moderatorDeletePost(p.id);
  };

  const manageBlocked = async () => {
    const ids = [...blockedIds];
    const { data } = supabase ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const names = Object.fromEntries((data || []).map((row) => [row.id, row.display_name]));
    const choice = await pickOption("Blocked players", "Choose a player to unblock.", ids.map((id) => ({ key: id, label: names[id] || "DinkTagum player", icon: "person-remove-outline" })));
    if (choice && await confirmAction(`Unblock ${names[choice] || "this player"}?`, "Their posts and comments will show in your feed again.", "Unblock")) unblockUser(choice);
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      data={loading ? [] : posts}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.volt}
          colors={[C.volt]}
          progressBackgroundColor={C.surface}
        />
      }
      renderItem={({ item: p }) => (
        <View style={{ paddingHorizontal: S.xl, marginBottom: S.md }}>
          <PostCard
            p={p}
            isMine={p.author_id === user.id}
            currentUserId={user.id}
            canModerate={isAdmin}
            onSave={(body) => updateCommunityPost(p.id, body)}
            onDelete={async () => { if (await confirmAction("Delete post?", "This removes your post from the community feed.")) deleteCommunityPost(p.id); }}
            onReport={() => report(p)}
            onBlock={safetySupported ? () => block(p) : undefined}
            onModeratorDelete={() => moderatorDelete(p)}
            onMore={(actions) => chooseAction("Post options", null, actions.map((a) => ({ tone: "default", ...a })))}
            onToggleLike={toggleLike}
            onLoadComments={loadComments}
            onAddComment={addComment}
            onDeleteComment={deleteComment}
            court={p.court_id ? courtsById[p.court_id] : null}
            onOpenCourt={onOpenCourt}
          />
        </View>
      )}
      ListHeaderComponent={
        <>
          <HeaderBar showBack title="Community" subtitle="Tagum City pickleball feed" />
          <View style={{ paddingHorizontal: S.xl, marginTop: S.lg, marginBottom: S.xl }}>
            <Composer user={user} profile={profile} courts={courts} courtTagsSupported={courtTagsSupported} postTypesSupported={postTypesSupported} myMatches={myMatches} createPost={createCommunityPost} />
          </View>
        </>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: S.xl }}>
          {loading ? <ActivityIndicator color={C.volt} /> : <EmptyCard icon="chatbubbles-outline" title="No posts yet" message="Be the first to share a game update." />}
        </View>
      }
      ListFooterComponent={
        <>
          {!loading && hasMorePosts ? (
            <TouchableOpacity onPress={loadMorePosts} disabled={loadingMorePosts} accessibilityRole="button" accessibilityLabel="Load more posts" style={{ alignSelf: "center", marginTop: S.md }}>
              {loadingMorePosts ? <ActivityIndicator color={C.volt} /> : <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700" }}>Load more posts</Text>}
            </TouchableOpacity>
          ) : null}
          {blockedIds.size ? (
            <TouchableOpacity onPress={manageBlocked} accessibilityRole="button" accessibilityLabel="Manage blocked players" style={feedStyles.blockedLink}>
              <Icon name="remove-circle-outline" size={15} color={C.textDim} />
              <Text style={feedStyles.blockedLinkText}>{blockedIds.size} blocked player{blockedIds.size === 1 ? "" : "s"} · Manage</Text>
            </TouchableOpacity>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
        </>
      }
    />
  );
}

export function FeedScreen() {
  const { session } = useAuth();
  const { profile, courts } = useDashboard();
  const { records } = useGameRecords();
  const { setDetail } = useOverlayNav();
  const feed = useCommunityFeed();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await feed.loadFirstPage?.();
    setRefreshing(false);
  };

  return (
    <ScreenFrame>
      <FeedTab
        user={session.user}
        profile={profile}
        posts={feed.communityPosts}
        loading={feed.postsLoading}
        error={feed.postsError}
        feed={feed}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        courts={courts}
        myMatches={records.filter((g) => !g.source_record_id)}
        onOpenCourt={setDetail}
      />
    </ScreenFrame>
  );
}

const feedStyles = StyleSheet.create({
  attach: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingRight: 14 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: S.sm, marginLeft: 50, paddingLeft: 10, borderRadius: 999, backgroundColor: C.voltSoft, maxWidth: "85%" },
  tagChipText: { color: C.volt, fontSize: 12.5, fontWeight: "700", flexShrink: 1 },
  tagRemove: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  attachText: { color: C.mist, fontSize: 13.5, fontWeight: "700", marginLeft: 6 },
  removePhoto: { position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.lineStrong, alignItems: "center", justifyContent: "center" },
  blockedLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", minHeight: 44, marginTop: S.md },
  blockedLinkText: { color: C.textDim, fontSize: 13, fontWeight: "600" },
});
