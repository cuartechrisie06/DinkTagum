import React, { useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useCommunityFeed } from "../context/CommunityFeedContext";
import { initialsFor } from "../utils/format";
import { confirmAction, notify } from "../utils/confirm";
import { uploadImageAsync } from "../utils/uploadImage";
import { Avatar, Button, C, EmptyCard, ErrorNote, HeaderBar, Icon, PostCard, S, ScreenFrame, profileName, styles } from "./shared";

function FeedTab({ user, profile, posts, loading, error, createPost, updatePost, deletePost, reportPost, toggleLike, loadComments, addComment, deleteComment, hasMorePosts, loadingMorePosts, loadMorePosts, onRefresh, refreshing }) {
  const [body, setBody] = useState("");
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
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
    const success = await createPost(trimmedBody, attachedPhotoUrl ? [attachedPhotoUrl] : []);
    setSubmitting(false);
    if (success) { setBody(""); setAttachedPhotoUrl(null); }
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
              <View style={styles.composeFooter}>
                <TouchableOpacity disabled={uploadingPhoto} onPress={pickPhoto} style={feedStyles.attach} accessibilityRole="button" accessibilityLabel="Attach a photo">
                  {uploadingPhoto ? <ActivityIndicator color={C.volt} size="small" /> : <Icon name="image-outline" size={20} color={C.volt} />}
                  <Text style={feedStyles.attachText}>{uploadingPhoto ? "Uploading…" : "Photo"}</Text>
                </TouchableOpacity>
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
  const { profile } = useDashboard();
  const { communityPosts, postsLoading, postsError, createCommunityPost, updateCommunityPost, deleteCommunityPost, reportCommunityPost, toggleLike, loadComments, addComment, deleteComment, hasMorePosts, loadingMorePosts, loadMorePosts, loadFirstPage } = useCommunityFeed();
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
      />
    </ScreenFrame>
  );
}

const feedStyles = StyleSheet.create({
  attach: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingRight: 10 },
  attachText: { color: C.mist, fontSize: 13.5, fontWeight: "700", marginLeft: 6 },
  removePhoto: { position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.lineStrong, alignItems: "center", justifyContent: "center" },
});
