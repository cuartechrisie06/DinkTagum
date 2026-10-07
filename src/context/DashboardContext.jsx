import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { useAuth } from "./AuthContext";
import { enrichCourt } from "../utils/courts";
import { readCache, savedAgoLabel, writeCache } from "../utils/cache";
import { parseSlotLabel, slotHasStarted, slotOverlapsBusy } from "../utils/slots";

// Re-exported so existing imports keep working.
export { parseSlotLabel, slotHasStarted, slotOverlapsBusy };

const DashboardContext = createContext(null);
const PROFILE_COLUMNS = "display_name, location, skill_level, avatar_url, preferred_game_type, is_directory_visible, created_at";

export function courtForDisplay(court) {
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
    surface: court.surface || null,
    opensAt: court.opens_at || null,
    closesAt: court.closes_at || null,
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

// The next pending/confirmed reservation that hasn't started yet, or null.
export function nextUpcomingReservation(reservations, now = Date.now()) {
  return reservations
    .filter((r) => ["pending", "confirmed"].includes(r.status) && new Date(r.start_time).getTime() >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;
}

export function canCancelReservation(reservation, now = Date.now()) {
  return ["pending", "confirmed"].includes(reservation.status) && new Date(reservation.start_time).getTime() > now;
}

// Mounted only while signed in (see app/_layout.jsx), keyed by user id, so a sign-out or
// switch to a different account remounts this provider instead of needing manual resets.
// Profile editor rules, keyed by field so the form can show each message under
// its input. Empty object when valid.
export function profileFieldErrors({ display_name, location, skill_level, avatar_url, preferred_game_type }) {
  const errors = {};
  const name = String(display_name ?? "").trim();
  const skillText = String(skill_level ?? "").trim();
  const skill = Number(skillText);
  if (!name) errors.display_name = "Your display name cannot be blank.";
  else if (name.length > 60) errors.display_name = "Keep your name under 60 characters.";
  if (String(location ?? "").trim().length > 120) errors.location = "Keep the location under 120 characters.";
  if (!skillText) errors.skill_level = "Enter your skill level, e.g. 3.5.";
  else if (!Number.isFinite(skill) || skill < 1 || skill > 5) errors.skill_level = "Use a number from 1.0 to 5.0.";
  const avatar = String(avatar_url ?? "").trim();
  if (avatar && !/^https?:\/\//i.test(avatar)) errors.avatar_url = "Use a full http or https image URL.";
  if (!["Singles", "Doubles", "Either"].includes(preferred_game_type)) errors.preferred_game_type = "Choose Singles, Doubles, or Either.";
  return errors;
}

// Network failures (no signal, server unreachable) as opposed to query errors.
export function isNetworkError(error) {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || error.status === 0 || /network|fetch|timed? ?out|offline/i.test(String(error.message || ""));
}

export function DashboardProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;

  const [profile, setProfile] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [availabilitySupported, setAvailabilitySupported] = useState(true);
  const [reserving, setReserving] = useState(false);
  const [courts, setCourts] = useState([]);
  const [rawCourts, setRawCourts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  // Booked ranges per court (today + tomorrow) for "Next slot", and the
  // player's favorite courts. Both are null/unsupported until the court
  // details migration is applied; the UI then just omits them.
  const [busyByCourt, setBusyByCourt] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [favoritesSupported, setFavoritesSupported] = useState(false);
  // Re-evaluates "Open now" / "Opens 8 AM" as the clock moves.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const loadBusyByCourt = useCallback(async () => {
    if (!supabase) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 2);
    const { data, error } = await supabase.rpc("all_courts_busy_slots", { p_range_start: start.toISOString(), p_range_end: end.toISOString() });
    if (error) { setBusyByCourt(null); return; }
    const grouped = {};
    for (const row of data || []) (grouped[row.court_id] ||= []).push(row);
    setBusyByCourt(grouped);
  }, []);

  const loadFavorites = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("favorite_courts").select("court_id").eq("user_id", userId);
    setFavoritesSupported(!error);
    if (!error) setFavoriteIds(new Set((data || []).map((row) => row.court_id)));
  }, [userId]);

  // Last dashboard seen on this device, so the app opens with data and still
  // shows courts and bookings when offline. Network data always wins.
  const cacheRef = useRef({ savedAt: null, fresh: false });
  useEffect(() => {
    let active = true;
    readCache("dashboard", userId).then((cached) => {
      if (!active || !cached || cacheRef.current.fresh) return;
      const { profile: cachedProfile, courts: cachedCourts, reservations: cachedReservations } = cached.data || {};
      if (cachedProfile) setProfile(cachedProfile);
      if (Array.isArray(cachedCourts)) { setRawCourts(cachedCourts); setCourts(cachedCourts.map(courtForDisplay)); }
      if (Array.isArray(cachedReservations)) setReservations(cachedReservations);
      cacheRef.current.savedAt = cached.savedAt;
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const offlineMessage = () => {
      const { savedAt } = cacheRef.current;
      return savedAt
        ? `You're offline. Showing data saved ${savedAgoLabel(savedAt)} — pull down to retry.`
        : "We could not reach the dashboard data. Check your connection and try again.";
    };
    const loadDashboard = async () => {
      setDashboardLoading(true);
      setDashboardError("");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !authData.user) {
        setDashboardError(isNetworkError(authError) ? offlineMessage() : "Your session has expired. Please sign in again.");
        setDashboardLoading(false);
        return;
      }
      const profileQuery = (columns) => supabase.from("profiles").select(columns).eq("id", authData.user.id).maybeSingle();
      const [profileAttempt, courtsResult, reservationResult] = await Promise.all([
        profileQuery(`${PROFILE_COLUMNS}, availability`),
        supabase.from("courts").select("*").order("name", { ascending: true }),
        supabase.from("reservations").select("*").eq("user_id", authData.user.id).order("start_time", { ascending: false }).limit(100),
      ]);
      if (!active) return;
      // profiles.availability arrives with a later migration.
      let profileResult = profileAttempt;
      if (profileAttempt.error && (profileAttempt.error.code === "42703" || /availability/.test(profileAttempt.error.message))) {
        setAvailabilitySupported(false);
        profileResult = await profileQuery(PROFILE_COLUMNS);
        if (!active) return;
      }
      if (profileResult.data) setProfile(profileResult.data);
      // A failed query keeps whatever is on screen (possibly cached) instead of
      // blanking the list.
      if (!courtsResult.error) { setRawCourts(courtsResult.data || []); setCourts((courtsResult.data || []).map(courtForDisplay)); }
      if (!reservationResult.error) setReservations(reservationResult.data || []);
      if (!profileResult.error && !courtsResult.error && !reservationResult.error) {
        cacheRef.current = { savedAt: Date.now(), fresh: true };
        writeCache("dashboard", authData.user.id, { profile: profileResult.data, courts: courtsResult.data || [], reservations: reservationResult.data || [] });
      }
      setNow(Date.now());
      await Promise.all([loadBusyByCourt(), loadFavorites()]);
      if (!active) return;
      const errors = [profileResult.error, courtsResult.error, reservationResult.error].filter(Boolean);
      if (errors.length && errors.every(isNetworkError)) setDashboardError(offlineMessage());
      else if (errors.length) setDashboardError(`Some dashboard data could not be loaded: ${errors.map((queryError) => queryError.message).join(" · ")}`);
      setDashboardLoading(false);
    };
    loadDashboard().catch(() => {
      if (!active) return;
      setDashboardError(offlineMessage());
      setDashboardLoading(false);
    });
    return () => { active = false; };
  }, [userId, reloadKey, loadBusyByCourt, loadFavorites]);

  // Optimistic: the heart flips immediately and rolls back if the write fails.
  const toggleFavorite = useCallback(async (courtId) => {
    if (!supabase || !favoritesSupported) return;
    const wasFavorite = favoriteIds.has(courtId);
    const flip = (on) => setFavoriteIds((current) => {
      const next = new Set(current);
      if (on) next.add(courtId); else next.delete(courtId);
      return next;
    });
    flip(!wasFavorite);
    const { error } = wasFavorite
      ? await supabase.from("favorite_courts").delete().eq("user_id", userId).eq("court_id", courtId)
      : await supabase.from("favorite_courts").insert({ user_id: userId, court_id: courtId });
    if (error) { flip(wasFavorite); notify("Could not update favorites", error.message); }
  }, [favoriteIds, favoritesSupported, userId]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Reservations joined to their display court; court rows can be missing if an
  // admin removed a court the player once booked.
  const reservationsWithCourts = useMemo(() => {
    const byId = Object.fromEntries(rawCourts.map((court) => [court.id, court]));
    return reservations.map((r) => ({ ...r, court: byId[r.court_id] ? courtForDisplay(byId[r.court_id]) : null }));
  }, [reservations, rawCourts]);
  const reservation = useMemo(() => nextUpcomingReservation(reservationsWithCourts), [reservationsWithCourts]);

  const saveProfile = useCallback(async (changes) => {
    if (!supabase) return false;
    const display_name = changes.display_name.trim();
    const location = changes.location.trim();
    const skill_level = Number(changes.skill_level);
    const avatar_url = changes.avatar_url.trim();
    const preferred_game_type = changes.preferred_game_type;
    const is_directory_visible = Boolean(changes.is_directory_visible);
    const firstError = Object.values(profileFieldErrors(changes))[0];
    if (firstError) { notify("Check your profile", firstError); return false; }
    setSavingProfile(true);
    const row = { id: userId, display_name, location: location || null, skill_level, avatar_url: avatar_url || null, preferred_game_type, is_directory_visible };
    if (availabilitySupported && Array.isArray(changes.availability)) row.availability = changes.availability;
    const { data, error } = await supabase.from("profiles").upsert(row, { onConflict: "id" }).select().single();
    setSavingProfile(false);
    if (error) { notify("Could not save profile", error.message); return false; }
    setProfile(data);
    return true;
  }, [userId, availabilitySupported]);

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

  // `hours` consecutive hours from timeLabel make one reservation.
  const createReservation = useCallback(async (court, dayKey, timeLabel, hours = 1) => {
    if (!supabase) return { ok: false, message: "Supabase is not configured." };
    if (court.status === "Closed") return { ok: false, message: "This court is closed and cannot be reserved." };
    if (court.status === "Full") return { ok: false, message: "This court is marked full and cannot take new reservations." };
    const { hour, minute } = parseSlotLabel(timeLabel);
    const start = new Date(`${dayKey}T00:00:00`);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
    if (start.getTime() <= Date.now()) return { ok: false, message: "That time has already started today. Pick a later slot or another day." };
    setReserving(true);
    const { data, error } = await supabase.from("reservations").insert({
      user_id: userId, court_id: court.id, start_time: start.toISOString(), end_time: end.toISOString(), status: "pending",
    }).select().single();
    setReserving(false);
    if (error) {
      const overlap = error.code === "23P01" || /overlap|exclusion|conflicting/i.test(error.message);
      return { ok: false, message: overlap ? "That time slot was just taken. Pick another time." : `Reservation not submitted: ${error.message}` };
    }
    setReservations((current) => [data, ...current]);
    loadBusyByCourt();
    return { ok: true, reservation: data };
  }, [userId, loadBusyByCourt]);

  // Players cancel rather than delete upcoming bookings: the row stays in their
  // history and the slot is freed (the overlap constraint ignores cancelled rows).
  const cancelReservation = useCallback(async (id) => {
    if (!supabase) return false;
    const { data, error } = await supabase.from("reservations").update({ status: "cancelled" }).eq("id", id).eq("user_id", userId).select().single();
    if (error) { notify("Could not cancel reservation", error.message); return false; }
    setReservations((current) => current.map((r) => (r.id === id ? data : r)));
    return true;
  }, [userId]);

  const deleteReservation = useCallback(async (id) => {
    if (!supabase) return false;
    const { error } = await supabase.from("reservations").delete().eq("id", id).eq("user_id", userId);
    if (error) { notify("Could not remove reservation", error.message); return false; }
    setReservations((current) => current.filter((r) => r.id !== id));
    return true;
  }, [userId]);

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

  const visibleCourts = useMemo(
    () => courtsNearLocation(courts, userLocation).map((court) => enrichCourt(court, { busyByCourt, favoriteIds, now })),
    [courts, userLocation, busyByCourt, favoriteIds, now],
  );

  const value = {
    profile,
    savingProfile,
    saveProfile,
    availabilitySupported,
    courts: visibleCourts,
    reservation,
    reservations: reservationsWithCourts,
    reserving,
    createReservation,
    cancelReservation,
    deleteReservation,
    reload,
    loadBusySlots,
    dashboardLoading,
    dashboardError,
    locationLoading,
    locationMessage,
    hasLocation: Boolean(userLocation),
    userLocation,
    findNearbyCourts,
    toggleFavorite,
    favoritesSupported,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used within DashboardProvider");
  return value;
}
