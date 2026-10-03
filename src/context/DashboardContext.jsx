import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { useAuth } from "./AuthContext";

const DashboardContext = createContext(null);

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

// The next pending/confirmed reservation that hasn't started yet, or null.
export function nextUpcomingReservation(reservations, now = Date.now()) {
  return reservations
    .filter((r) => ["pending", "confirmed"].includes(r.status) && new Date(r.start_time).getTime() >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0] || null;
}

export function canCancelReservation(reservation, now = Date.now()) {
  return ["pending", "confirmed"].includes(reservation.status) && new Date(reservation.start_time).getTime() > now;
}

// True once a slot on the given day has started, so it can no longer be booked.
export function slotHasStarted(dayDate, timeLabel, now = Date.now()) {
  const { hour, minute } = parseSlotLabel(timeLabel);
  const start = new Date(dayDate);
  start.setHours(hour, minute, 0, 0);
  return start.getTime() <= now;
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

// Mounted only while signed in (see app/_layout.jsx), keyed by user id, so a sign-out or
// switch to a different account remounts this provider instead of needing manual resets.
export function DashboardProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;

  const [profile, setProfile] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
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

  useEffect(() => {
    if (!supabase) return undefined;
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
      const [profileResult, courtsResult, reservationResult] = await Promise.all([
        supabase.from("profiles").select("display_name, location, skill_level, avatar_url, preferred_game_type, is_directory_visible, created_at").eq("id", authData.user.id).maybeSingle(),
        supabase.from("courts").select("*").order("name", { ascending: true }),
        supabase.from("reservations").select("*").eq("user_id", authData.user.id).order("start_time", { ascending: false }).limit(100),
      ]);
      if (!active) return;
      if (profileResult.data) setProfile(profileResult.data);
      setRawCourts(courtsResult.data || []);
      setCourts((courtsResult.data || []).map(courtForDisplay));
      setReservations(reservationResult.data || []);
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
  }, [userId, reloadKey]);

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
    if (!display_name) { notify("Add your name", "Your display name cannot be blank."); return false; }
    if (!Number.isFinite(skill_level) || skill_level < 1 || skill_level > 5) { notify("Check skill level", "Use a number from 1.0 to 5.0."); return false; }
    if (avatar_url && !/^https?:\/\//i.test(avatar_url)) { notify("Check avatar URL", "Use a full http or https image URL."); return false; }
    if (!["Singles", "Doubles", "Either"].includes(preferred_game_type)) { notify("Check game type", "Choose Singles, Doubles, or Either."); return false; }
    setSavingProfile(true);
    const { data, error } = await supabase.from("profiles").upsert({ id: userId, display_name, location: location || null, skill_level, avatar_url: avatar_url || null, preferred_game_type, is_directory_visible }, { onConflict: "id" }).select().single();
    setSavingProfile(false);
    if (error) { notify("Could not save profile", error.message); return false; }
    setProfile(data);
    return true;
  }, [userId]);

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
    if (!supabase) return { ok: false, message: "Supabase is not configured." };
    if (court.status === "Closed") return { ok: false, message: "This court is closed and cannot be reserved." };
    if (court.status === "Full") return { ok: false, message: "This court is marked full and cannot take new reservations." };
    const { hour, minute } = parseSlotLabel(timeLabel);
    const start = new Date(`${dayKey}T00:00:00`);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
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
    return { ok: true };
  }, [userId]);

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

  const visibleCourts = useMemo(() => courtsNearLocation(courts, userLocation), [courts, userLocation]);

  const value = {
    profile,
    savingProfile,
    saveProfile,
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
    findNearbyCourts,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("useDashboard must be used within DashboardProvider");
  return value;
}
