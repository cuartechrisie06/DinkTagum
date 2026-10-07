import React, { useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useCommunityFeed } from "../context/CommunityFeedContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor } from "../utils/format";
import { confirmAction, notify } from "../utils/confirm";
import { uploadImageAsync } from "../utils/uploadImage";
import { Avatar, Button, C, EmptyCard, ErrorNote, HeaderBar, Icon, PostCard, S, ScreenFrame, profileName, styles } from "./shared";

function FeedTab({ user, profile, posts, loading, error, createPost, updatePost, deletePost, reportPost, toggleLike, loadComments, addComment, deleteComment, hasMorePosts, loadingMorePosts, loadMorePosts, onRefresh, refreshing, courts, courtTagsSupported, onOpenCourt }) {
  const [body, setBody] = useState("");
  const [taggedCourt, setTaggedCourt] = useState(null);
  const [pickingCourt, setPickingCourt] = useState(false);
  const courtsById = Object.fromEntries(courts.map((c) => [c.id, c]));
  const [submitting, setSubmitting] = useState(false);
  const [attachedPhotoUrl, setAttachedPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
  };

  const submit = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    setSubmitting(true);
    const success = await createPost(trimmedBody, attachedPhotoUrl ? [attachedPhotoUrl] : [], taggedCourt?.id || null);
    setSubmitting(false);
    if (success) { setBody(""); setAttachedPhotoUrl(null); setTaggedCourt(null); setPickingCourt(false); }
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
            onSave={(body) => updatePost(p.id, body)}
            onDelete={async () => { if (await confirmAction("Delete post?", "This removes your post from the community feed.")) deletePost(p.id); }}
            onReport={async () => { if (await confirmAction("Report post?", "An admin will review it. It will be hidden from the feed until then.", "Report")) reportPost(p.id); }}
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
            <View style={styles.composeCard}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <Avatar initials={initialsFor(profileName(profile, user))} uri={profile?.avatar_url} size={38} />
                <TextInput value={body} onChangeText={setBody} maxLength={2000} multiline placeholder="How was your game today?" placeholderTextColor={C.textFaint} style={styles.composeInput} accessibilityLabel="Share your game" />
              </View>
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
                  <Text style={feedStyles.tagChipText} numberOfLines={1}>{taggedCourt.name}</Text>
                  <TouchableOpacity onPress={() => setTaggedCourt(null)} style={feedStyles.tagRemove} accessibilityRole="button" accessibilityLabel={`Remove ${taggedCourt.name} tag`}>
                    <Icon name="close" size={14} color={C.volt} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {pickingCourt && !taggedCourt ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.sm, flexGrow: 0 }} contentContainerStyle={{ gap: S.sm }} keyboardShouldPersistTaps="handled">
                  {courts.map((c) => (
                    <TouchableOpacity key={c.id} onPress={() => { setTaggedCourt(c); setPickingCourt(false); }} style={[styles.chip, { marginRight: 0, minHeight: 40, justifyContent: "center" }]} accessibilityRole="button" accessibilityLabel={`Tag ${c.name}`}>
                      <Text style={styles.chipText}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
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
                <Button label="Post" icon="send" onPress={submit} loading={submitting} disabled={!body.trim()} style={{ minHeight: 38, paddingHorizontal: S.lg }} accessibilityLabel="Publish post" />
              </View>
            </View>
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
          <ErrorNote>{error}</ErrorNote>
        </>
      }
    />
  );
}

export function FeedScreen() {
  const { session } = useAuth();
  const { profile, courts } = useDashboard();
  const { setDetail } = useOverlayNav();
  const { communityPosts, postsLoading, postsError, createCommunityPost, updateCommunityPost, deleteCommunityPost, reportCommunityPost, toggleLike, loadComments, addComment, deleteComment, hasMorePosts, loadingMorePosts, loadMorePosts, loadFirstPage, courtTagsSupported } = useCommunityFeed();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage?.();
    setRefreshing(false);
  };

  return (
    <ScreenFrame>
      <FeedTab
        user={session.user}
        profile={profile}
        posts={communityPosts}
        loading={postsLoading}
        error={postsError}
        createPost={createCommunityPost}
        updatePost={updateCommunityPost}
        deletePost={deleteCommunityPost}
        reportPost={reportCommunityPost}
        toggleLike={toggleLike}
        loadComments={loadComments}
        addComment={addComment}
        deleteComment={deleteComment}
        hasMorePosts={hasMorePosts}
        loadingMorePosts={loadingMorePosts}
        loadMorePosts={loadMorePosts}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        courts={courts}
        courtTagsSupported={courtTagsSupported}
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
});
