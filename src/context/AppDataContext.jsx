import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";

const AppDataContext = createContext(null);

function courtForDisplay(court) {
  const distance = court.distance_km ?? court.distance ?? null;
  const status = ["Available", "Full", "Closed"].includes(court.status) ? court.status : "Available";
  return {
    id: court.id,
    name: court.name || "Unnamed court",
    area: court.area || court.location || court.address || "Tagum City",
    dist: distance === null ? "Distance unavailable" : `${distance} km`,
    status,
    courts: court.court_count || court.number_of_courts || 1,
    hours: court.hours || court.opening_hours || "Hours unavailable",
    amenities: Array.isArray(court.amenities) ? court.amenities : [],
    rating: Number(court.rating || 0),
    address: court.address || court.location || court.area || "Address unavailable",
    contactName: court.contact_name || "",
    contactPhone: court.contact_phone || "",
    hourlyRate: court.hourly_rate === null || court.hourly_rate === undefined ? null : Number(court.hourly_rate),
    scheduleNote: court.schedule_note || "",
    photoUrls: Array.isArray(court.photo_urls) ? court.photo_urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)) : [],
    latitude: Number(court.latitude),
    longitude: Number(court.longitude),
  };
}

function distanceInKm(from, to) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function courtsNearLocation(courts, location) {
  if (!location) return courts;
  return courts
    .filter((court) => Number.isFinite(court.latitude) && Number.isFinite(court.longitude))
    .map((court) => ({ ...court, dist: `${distanceInKm(location, court).toFixed(1)} km` }))
    .sort((a, b) => Number.parseFloat(a.dist) - Number.parseFloat(b.dist));
}

export function communityPostForDisplay(post, profilesById, currentUser, currentProfile) {
  const author = post.author_id === currentUser?.id ? currentProfile : profilesById[post.author_id];
  const name = author?.display_name || "DinkTagum player";
  const initials = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DT";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(post.created_at).getTime()) / 1000));
  let time = "Just now";
  if (seconds >= 86400) time = new Date(post.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  else if (seconds >= 3600) time = `${Math.floor(seconds / 3600)}h ago`;
  else if (seconds >= 60) time = `${Math.floor(seconds / 60)}m ago`;
  return { ...post, name, initials, avatarUrl: author?.avatar_url, time, text: post.body };
}

export function parseSlotLabel(timeLabel) {
  const [time, meridiem] = timeLabel.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

export function buildDayOptions(count = 3) {
  const days = [];
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const label = offset === 0
      ? "Today"
      : offset === 1
        ? "Tomorrow"
        : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    days.push({ key, label, date });
  }
  return days;
}

export function slotOverlapsBusy(dayDate, timeLabel, busyRanges) {
  const { hour, minute } = parseSlotLabel(timeLabel);
  const start = new Date(dayDate);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return busyRanges.some((range) => {
    const busyStart = new Date(range.start_time).getTime();
    const busyEnd = new Date(range.end_time).getTime();
    return start.getTime() < busyEnd && end.getTime() > busyStart;
  });
}

export function AppDataProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [courts, setCourts] = useState([]);
  const [reservation, setReservation] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [detail, setDetail] = useState(null);
  const [chatView, setChatView] = useState(null);
  const [notificationView, setNotificationView] = useState(false);
  const [adminView, setAdminView] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }
    supabase.auth.getSession()
      .then(({ data: { session: currentSession } }) => {
        setSession(currentSession);
        setAuthReady(true);
      })
      .catch(() => {
        setSession(null);
        setAuthReady(true);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user || !supabase) {
      setProfile(null);
      setCourts([]);
      setReservation(null);
      setDashboardError("");
      return undefined;
    }
    let active = true;
    const loadDashboard = async () => {
      setDashboardLoading(true);
      setDashboardError("");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setDashboardError("Your session has expired. Please sign in again.");
        setDashboardLoading(false);
        return;
      }
      const userId = authData.user.id;
      const [profileResult, courtsResult, reservationResult] = await Promise.all([
        supabase.from("profiles").select("display_name, location, skill_level, avatar_url, preferred_game_type, is_directory_visible, created_at").eq("id", userId).maybeSingle(),
        supabase.from("courts").select("*").order("name", { ascending: true }),
        supabase.from("reservations").select("*").eq("user_id", userId).in("status", ["pending", "confirmed"]).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (!active) return;
      if (profileResult.data) setProfile(profileResult.data);
      setCourts((courtsResult.data || []).map(courtForDisplay));
      const liveReservation = reservationResult.data || null;
      const reservationCourt = liveReservation ? (courtsResult.data || []).find((court) => court.id === liveReservation.court_id) : null;
      setReservation(liveReservation ? { ...liveReservation, court: reservationCourt ? courtForDisplay(reservationCourt) : null } : null);
      const errors = [profileResult.error, courtsResult.error, reservationResult.error].filter(Boolean);
      if (errors.length) setDashboardError(`Some dashboard data could not be loaded: ${errors.map((queryError) => queryError.message).join(" · ")}`);
      setDashboardLoading(false);
    };
    loadDashboard().catch(() => {
      if (!active) return;
      setDashboardError("We could not reach the dashboard data. Check your connection and try again.");
      setDashboardLoading(false);
    });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session?.user || !supabase) {
      setCommunityPosts([]);
      setPostsError("");
      return undefined;
    }
    let active = true;
    const loadPosts = async () => {
      setPostsLoading(true);
      const { data: postRows, error: postError } = await supabase.from("community_posts").select("id, author_id, body, photo_urls, created_at").order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (postError) {
        setPostsError(`Community posts could not be loaded: ${postError.message}`);
        setPostsLoading(false);
        return;
      }
      const authorIds = [...new Set((postRows || []).map((post) => post.author_id).filter((id) => id !== session.user.id))];
      const { data: authorRows } = authorIds.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", authorIds) : { data: [] };
      if (!active) return;
      const profilesById = Object.fromEntries((authorRows || []).map((author) => [author.id, author]));
      setCommunityPosts((postRows || []).map((post) => communityPostForDisplay(post, profilesById, session.user, profile)));
      setPostsError("");
      setPostsLoading(false);
    };
    loadPosts();
    const channel = supabase.channel(`community-posts-${session.user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, loadPosts).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  // Intentionally keyed on identity fields so author labels refresh without full profile object churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- session.user and profile objects change identity often
  }, [session?.user?.id, profile?.display_name, profile?.avatar_url]);

  const createCommunityPost = useCallback(async (body) => {
    if (!session?.user || !supabase) return false;
    const { data, error } = await supabase.from("community_posts").insert({ author_id: session.user.id, body }).select("id, author_id, body, photo_urls, created_at").single();
    if (error) { Alert.alert("Could not publish post", error.message); return false; }
    setCommunityPosts((current) => {
      if (current.some((post) => post.id === data.id)) return current;
      return [communityPostForDisplay(data, {}, session.user, profile), ...current];
    });
    return true;
  }, [session, profile]);

  const saveProfile = useCallback(async (changes) => {
    if (!session?.user || !supabase) return false;
    const display_name = changes.display_name.trim();
    const location = changes.location.trim();
    const skill_level = Number(changes.skill_level);
    const avatar_url = changes.avatar_url.trim();
    const preferred_game_type = changes.preferred_game_type;
    const is_directory_visible = Boolean(changes.is_directory_visible);
    if (!display_name) { Alert.alert("Add your name", "Your display name cannot be blank."); return false; }
    if (!Number.isFinite(skill_level) || skill_level < 1 || skill_level > 5) { Alert.alert("Check skill level", "Use a number from 1.0 to 5.0."); return false; }
    if (avatar_url && !/^https?:\/\//i.test(avatar_url)) { Alert.alert("Check avatar URL", "Use a full http or https image URL."); return false; }
    if (!["Singles", "Doubles", "Either"].includes(preferred_game_type)) { Alert.alert("Check game type", "Choose Singles, Doubles, or Either."); return false; }
    setSavingProfile(true);
    const { data, error } = await supabase.from("profiles").upsert({ id: session.user.id, display_name, location: location || null, skill_level, avatar_url: avatar_url || null, preferred_game_type, is_directory_visible }, { onConflict: "id" }).select().single();
    setSavingProfile(false);
    if (error) { Alert.alert("Could not save profile", error.message); return false; }
    setProfile(data);
    return true;
  }, [session]);

  const loadBusySlots = useCallback(async (courtId, dayKey) => {
    if (!supabase || !courtId || !dayKey) return [];
    const rangeStart = new Date(`${dayKey}T00:00:00`);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const { data, error } = await supabase.rpc("court_busy_slots", {
      p_court_id: courtId,
      p_range_start: rangeStart.toISOString(),
      p_range_end: rangeEnd.toISOString(),
    });

    if (!error && Array.isArray(data)) {
      return data;
    }

    if (error) {
      console.warn("Could not load court busy slots from RPC:", error.message);
      // Fallback: direct query on reservations table if RPC is not yet in schema cache
      try {
        const { data: resData, error: resError } = await supabase
          .from("reservations")
          .select("start_time, end_time")
          .eq("court_id", courtId)
          .in("status", ["pending", "confirmed"])
          .lt("start_time", rangeEnd.toISOString())
          .gt("end_time", rangeStart.toISOString());

        if (!resError && Array.isArray(resData)) {
          return resData.map((r) => ({
            start_time: r.start_time,
            end_time: r.end_time || new Date(new Date(r.start_time).getTime() + 60 * 60 * 1000).toISOString(),
          }));
        }
      } catch (fallbackErr) {
        console.warn("Reservations fallback query failed:", fallbackErr);
      }
    }

    return [];
  }, []);

  const createReservation = useCallback(async (court, dayKey, timeLabel) => {
    if (!session?.user || !supabase) return false;
    if (court.status === "Closed") {
      Alert.alert("Court closed", "This court is closed and cannot be reserved.");
      return false;
    }
    if (court.status === "Full") {
      Alert.alert("Court full", "This court is marked full and cannot take new reservations.");
      return false;
    }
    const { hour, minute } = parseSlotLabel(timeLabel);
    const start = new Date(`${dayKey}T00:00:00`);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (start.getTime() <= Date.now()) {
      Alert.alert("Pick a future time", "Choose a slot that has not already started.");
      return false;
    }
    setReserving(true);
    const { data, error } = await supabase.from("reservations").insert({
      user_id: session.user.id, court_id: court.id, start_time: start.toISOString(), end_time: end.toISOString(), status: "pending",
    }).select().single();
    setReserving(false);
    if (error) {
      const overlap = /overlap|exclusion|23P01|conflicting/i.test(error.message);
      Alert.alert("Reservation not submitted", overlap ? "That time slot was just taken. Pick another time." : error.message);
      return false;
    }
    setReservation({ ...data, court });
    return true;
  }, [session]);

  const findNearbyCourts = useCallback(async () => {
    setLocationLoading(true);
    setLocationMessage("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationMessage("Location access was not granted. You can still browse all courts.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (_error) {
      setLocationMessage("We could not get your location. Check that location services are enabled and try again.");
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
    await supabase?.auth.signOut();
  }, []);

  const closeOverlays = useCallback(() => {
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
  }, []);

  const visibleCourts = useMemo(() => courtsNearLocation(courts, userLocation), [courts, userLocation]);
  const isAdmin = session?.user?.app_metadata?.role === "admin";
  const hasOverlay = Boolean(detail || chatView || notificationView || adminView);

  const value = {
    session,
    authReady,
    profile,
    savingProfile,
    reserving,
    courts: visibleCourts,
    reservation,
    communityPosts,
    postsLoading,
    postsError,
    dashboardLoading,
    dashboardError,
    locationLoading,
    locationMessage,
    hasLocation: Boolean(userLocation),
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
    isAdmin,
    createCommunityPost,
    saveProfile,
    createReservation,
    loadBusySlots,
    findNearbyCourts,
    signOut,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used within AppDataProvider");
  return value;
}
