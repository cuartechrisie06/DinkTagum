import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { initialsFor, relativeTime } from "../utils/format";
import { useAuth } from "./AuthContext";
import { useDashboard } from "./DashboardContext";

const CommunityFeedContext = createContext(null);
const POSTS_PAGE_SIZE = 20;

export function communityPostForDisplay(post, profilesById, currentUser, currentProfile, likesById = {}, commentCountById = {}) {
  const author = post.author_id === currentUser?.id ? currentProfile : profilesById[post.author_id];
  const name = author?.display_name || "DinkTagum player";
  const initials = initialsFor(name);
  const time = relativeTime(post.created_at);
  const photoUrls = Array.isArray(post.photo_urls) ? post.photo_urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)) : [];
  const likeInfo = likesById[post.id] || { count: 0, likedByMe: false };
  return { ...post, name, initials, avatarUrl: author?.avatar_url, time, text: post.body, photoUrls, likeCount: likeInfo.count, likedByMe: likeInfo.likedByMe, commentCount: commentCountById[post.id] || 0 };
}

// Mounted only while signed in (see app/_layout.jsx), keyed by user id.
export function CommunityFeedProvider({ children }) {
  const { session } = useAuth();
  const { profile } = useDashboard();
  const userId = session.user.id;

  const [communityPosts, setCommunityPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);

  // Likes/comment counts are fetched as raw rows and reduced client-side
  // rather than through a count-per-post RPC — simplest option at this
  // app's scale, and it reuses the same "fetch related rows, batch by id"
  // pattern already used for author profiles below.
  const fetchReactions = useCallback(async (postIds) => {
    if (!postIds.length) return { likesById: {}, commentCountById: {} };
    const [likeRows, commentRows] = await Promise.all([
      supabase.from("community_post_likes").select("post_id, user_id").in("post_id", postIds),
      supabase.from("community_post_comments").select("post_id").in("post_id", postIds),
    ]);
    const likesById = {};
    for (const row of likeRows.data || []) {
      const entry = likesById[row.post_id] || { count: 0, likedByMe: false };
      entry.count += 1;
      if (row.user_id === userId) entry.likedByMe = true;
      likesById[row.post_id] = entry;
    }
    const commentCountById = {};
    for (const row of commentRows.data || []) {
      commentCountById[row.post_id] = (commentCountById[row.post_id] || 0) + 1;
    }
    return { likesById, commentCountById };
  }, [userId]);

  const hydratePosts = useCallback(async (postRows) => {
    const authorIds = [...new Set(postRows.map((post) => post.author_id).filter((id) => id !== userId))];
    const [authorResult, reactions] = await Promise.all([
      authorIds.length ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds) : Promise.resolve({ data: [] }),
      fetchReactions(postRows.map((post) => post.id)),
    ]);
    const profilesById = Object.fromEntries((authorResult.data || []).map((author) => [author.id, author]));
    return postRows.map((post) => communityPostForDisplay(post, profilesById, session.user, profile, reactions.likesById, reactions.commentCountById));
    // Intentionally keyed on identity fields, not the session.user/profile objects
    // themselves, which can change reference on every render and would otherwise
    // recreate this callback (and the effect below) in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile?.display_name, profile?.avatar_url, fetchReactions]);

  // Loads (or reloads) just the first page. Used on mount and by the Realtime
  // subscription below, so any change anywhere resets back to the freshest
  // first page rather than trying to patch a specific row in place.
  const loadFirstPage = useCallback(async () => {
    if (!supabase) return;
    setPostsLoading(true);
    const { data: postRows, error: postError } = await supabase.from("community_posts").select("id, author_id, body, photo_urls, created_at").order("created_at", { ascending: false }).range(0, POSTS_PAGE_SIZE - 1);
    if (postError) {
      setPostsError(`Community posts could not be loaded: ${postError.message}`);
      setPostsLoading(false);
      return;
    }
    setCommunityPosts(await hydratePosts(postRows || []));
    setHasMorePosts((postRows || []).length === POSTS_PAGE_SIZE);
    setPostsError("");
    setPostsLoading(false);
  }, [hydratePosts]);

  useEffect(() => {
    if (!supabase) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadFirstPage sets state after its awaits
    loadFirstPage();
    const channel = supabase.channel(`community-posts-${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, loadFirstPage).subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, loadFirstPage]);

  const loadMorePosts = useCallback(async () => {
    if (!supabase || loadingMorePosts || !hasMorePosts || !communityPosts.length) return;
    setLoadingMorePosts(true);
    const from = communityPosts.length;
    const { data: postRows, error: postError } = await supabase.from("community_posts").select("id, author_id, body, photo_urls, created_at").order("created_at", { ascending: false }).range(from, from + POSTS_PAGE_SIZE - 1);
    setLoadingMorePosts(false);
    if (postError) { setPostsError(`More posts could not be loaded: ${postError.message}`); return; }
    const hydrated = await hydratePosts(postRows || []);
    setCommunityPosts((current) => [...current, ...hydrated]);
    setHasMorePosts((postRows || []).length === POSTS_PAGE_SIZE);
  }, [loadingMorePosts, hasMorePosts, communityPosts.length, hydratePosts]);

  const createCommunityPost = useCallback(async (body, photoUrls = []) => {
    if (!supabase) return false;
    const { data, error } = await supabase.from("community_posts").insert({ author_id: userId, body, photo_urls: photoUrls }).select("id, author_id, body, photo_urls, created_at").single();
    if (error) { notify("Could not publish post", error.message); return false; }
    setCommunityPosts((current) => {
      if (current.some((post) => post.id === data.id)) return current;
      return [communityPostForDisplay(data, {}, session.user, profile), ...current];
    });
    return true;
  }, [userId, session.user, profile]);

  const updateCommunityPost = useCallback(async (id, body) => {
    if (!supabase) return false;
    const trimmed = body.trim();
    if (!trimmed) { notify("Post is empty", "Write something before saving."); return false; }
    const { data, error } = await supabase.from("community_posts").update({ body: trimmed, updated_at: new Date().toISOString() }).eq("id", id).eq("author_id", userId).select("id, author_id, body, photo_urls, created_at").single();
    if (error) { notify("Could not update post", error.message); return false; }
    setCommunityPosts((current) => current.map((post) => (post.id === id ? { ...post, body: data.body, text: data.body } : post)));
    return true;
  }, [userId]);

  const deleteCommunityPost = useCallback(async (id) => {
    if (!supabase) return false;
    const { error } = await supabase.from("community_posts").delete().eq("id", id).eq("author_id", userId);
    if (error) { notify("Could not delete post", error.message); return false; }
    setCommunityPosts((current) => current.filter((post) => post.id !== id));
    return true;
  }, [userId]);

  // Reported posts are hidden from everyone but their author and admins
  // (see the community_posts_select policy), so drop it from this feed.
  const reportCommunityPost = useCallback(async (id) => {
    if (!supabase) return false;
    const { error } = await supabase.rpc("report_community_post", { p_post_id: id });
    if (error) { notify("Could not report post", error.message); return false; }
    setCommunityPosts((current) => current.filter((post) => post.id !== id));
    return true;
  }, []);

  // Guards against a single tap reaching here twice (React Native Web can fire
  // onPress more than once per tap) before the optimistic update above has
  // re-rendered — without this, the second call still sees the pre-tap
  // currentlyLiked value and tries to insert a like that the first call
  // already inserted, hitting the unique constraint.
  const pendingLikePostIds = useRef(new Set());

  const toggleLike = useCallback(async (postId, currentlyLiked) => {
    if (!supabase || pendingLikePostIds.current.has(postId)) return;
    pendingLikePostIds.current.add(postId);
    setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, likedByMe: !currentlyLiked, likeCount: post.likeCount + (currentlyLiked ? -1 : 1) } : post)));
    const { error } = currentlyLiked
      ? await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", userId)
      : await supabase.from("community_post_likes").insert({ post_id: postId, user_id: userId });
    pendingLikePostIds.current.delete(postId);
    // A duplicate-key error here just means the like already exists (e.g. a
    // race with another tap, or it was already seeded) — the end state the
    // user wanted is already true, so treat it as success rather than an error.
    if (error && error.code !== "23505") {
      setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, likedByMe: currentlyLiked, likeCount: post.likeCount + (currentlyLiked ? 1 : -1) } : post)));
      notify("Could not update like", error.message);
    }
  }, [userId]);

  const loadComments = useCallback(async (postId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.from("community_post_comments").select("id, post_id, author_id, body, created_at").eq("post_id", postId).order("created_at", { ascending: true }).limit(200);
    if (error) { notify("Could not load comments", error.message); return []; }
    const authorIds = [...new Set((data || []).map((c) => c.author_id).filter((id) => id !== userId))];
    const { data: authorRows } = authorIds.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds) : { data: [] };
    const profilesById = Object.fromEntries((authorRows || []).map((a) => [a.id, a]));
    return (data || []).map((c) => {
      const author = c.author_id === userId ? profile : profilesById[c.author_id];
      const name = author?.display_name || "DinkTagum player";
      return { ...c, name, initials: initialsFor(name), avatarUrl: author?.avatar_url, time: relativeTime(c.created_at) };
    });
  }, [userId, profile]);

  const addComment = useCallback(async (postId, body) => {
    const trimmed = body.trim();
    if (!trimmed || !supabase) return { ok: false };
    const { data, error } = await supabase.from("community_post_comments").insert({ post_id: postId, author_id: userId, body: trimmed }).select("id, post_id, author_id, body, created_at").single();
    if (error) { notify("Could not post comment", error.message); return { ok: false }; }
    setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, commentCount: post.commentCount + 1 } : post)));
    const name = profile?.display_name || "You";
    return { ok: true, comment: { ...data, name, initials: initialsFor(name), avatarUrl: profile?.avatar_url, time: "Just now" } };
  }, [userId, profile]);

  const deleteComment = useCallback(async (commentId, postId) => {
    if (!supabase) return false;
    const { error } = await supabase.from("community_post_comments").delete().eq("id", commentId);
    if (error) { notify("Could not delete comment", error.message); return false; }
    setCommunityPosts((current) => current.map((post) => (post.id === postId ? { ...post, commentCount: Math.max(0, post.commentCount - 1) } : post)));
    return true;
  }, []);

  const value = {
    communityPosts, postsLoading, postsError, hasMorePosts, loadingMorePosts, loadMorePosts,
    createCommunityPost, updateCommunityPost, deleteCommunityPost, reportCommunityPost,
    toggleLike, loadComments, addComment, deleteComment,
    loadFirstPage,
  };
  return <CommunityFeedContext.Provider value={value}>{children}</CommunityFeedContext.Provider>;
}

export function useCommunityFeed() {
  const value = useContext(CommunityFeedContext);
  if (!value) throw new Error("useCommunityFeed must be used within CommunityFeedProvider");
  return value;
}
