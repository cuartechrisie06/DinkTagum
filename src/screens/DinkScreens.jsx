import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, StatusBar, Switch, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import CourtsMap from "../components/CourtsMap";
import {
  buildDayOptions,
  slotOverlapsBusy,
  useAppData,
} from "../context/AppDataContext";

const C = {
  ink: "#06231D",
  surface: "#0C342C",
  surface2: "#0F3E33",
  brand: "#076653",
  volt: "#E3EF26",
  mist: "#E2FBCE",
  butter: "#FFEFB3",
  paper: "#FFFDEE",
  line: "rgba(226,251,206,0.14)",
  textDim: "rgba(255,253,238,0.62)",
};

// ---------------- DATA ----------------
const CONVOS = [
  { id: 1, name: "RJ Delos Santos", initials: "RD", last: "See you at 4pm at Magugpo!", time: "2m", unread: true },
  { id: 2, name: "Doubles Squad", initials: "DS", last: "Angel: I'll bring extra balls", time: "1h", unread: true },
  { id: 3, name: "Apokon Court Admin", initials: "AC", last: "Your reservation is confirmed.", time: "Yesterday", unread: false },
];

const THREAD = [
  { mine: false, text: "Hey! Saw you're 3.5 level, want to play doubles Saturday?" },
  { mine: true, text: "Yes! What time works for you?" },
  { mine: false, text: "4:00 PM at Magugpo Sports Center, court's open" },
  { mine: true, text: "Perfect, see you at 4pm at Magugpo!" },
];

const SLOTS = ["6:00 AM", "7:00 AM", "8:00 AM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"];

function reservationTime(reservation) {
  if (!reservation?.start_time) return "Time to be confirmed";
  const start = new Date(reservation.start_time);
  const end = reservation.end_time ? new Date(reservation.end_time) : null;
  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endTime = end ? ` – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  return `${date} · ${time}${endTime}`;
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function calculateProfileStats(gameRecords) {
  const wins = gameRecords.filter((game) => game.result === "win").length;
  const losses = gameRecords.length - wins;
  const pointsFor = gameRecords.reduce((total, game) => total + Number(game.player_score || 0), 0);
  const pointsAgainst = gameRecords.reduce((total, game) => total + Number(game.opponent_score || 0), 0);
  return {
    matchesPlayed: gameRecords.length,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    winRate: gameRecords.length ? Math.round((wins / gameRecords.length) * 100) : null,
    winLossRatio: losses ? (wins / losses).toFixed(2) : wins ? "Perfect" : "—",
  };
}

function matchHistoryFromRecords(gameRecords, limit = 8) {
  return gameRecords.slice(0, limit).map((game) => ({
    id: game.id,
    opponent: game.opponents,
    playerScore: game.player_score,
    opponentScore: game.opponent_score,
    result: game.result,
    playedOn: game.played_on,
  }));
}

// ---------------- SMALL PIECES ----------------
function Icon({ glyph, size = 16, color = C.paper }) {
  return <Text style={{ fontSize: size, color, lineHeight: size + 2 }}>{glyph}</Text>;
}

function StatusPill({ status }) {
  const map = {
    Available: { bg: C.volt, fg: C.ink },
    Full: { bg: C.butter, fg: C.ink },
    Closed: { bg: "rgba(255,253,238,0.15)", fg: C.textDim },
  };
  const s = map[status] ?? map.Available;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{status}</Text>
    </View>
  );
}

function Avatar({ initials, size = 40, ring, uri }) {
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

function DashedDivider() {
  return <View style={{ borderTopWidth: 1, borderColor: C.line, borderStyle: "dashed", marginVertical: 14 }} />;
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function IconBtn({ glyph, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.iconBtn}>
      <Icon glyph={glyph} size={16} color={C.ink} />
    </TouchableOpacity>
  );
}

function HeaderBar({ title, subtitle, onChat, onNotifications }) {
  return (
    <View style={styles.headerRow}>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>📍 {subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: "row" }}>
        <IconBtn glyph="💬" onPress={onChat} />
        <View style={{ width: 8 }} />
        <IconBtn glyph="🔔" onPress={onNotifications} />
      </View>
    </View>
  );
}

function CourtCard({ c, onPress, compact }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.courtCard, compact && { width: 210, marginRight: 12 }]}>
      <View style={styles.courtThumb} />
      <Text style={styles.courtName}>{c.name}</Text>
      <Text style={styles.courtSub}>📍 {c.area} · {c.dist}</Text>
      <View style={styles.courtFooterRow}>
        <StatusPill status={c.status} />
        <Text style={{ color: C.volt, fontSize: 11 }}>★ {c.rating}</Text>
      </View>
    </TouchableOpacity>
  );
}

function PostCard({ p, compact }) {
  return (
    <View style={styles.postCard}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Avatar initials={p.initials} uri={p.avatarUrl} size={34} />
        <View style={{ marginLeft: 10 }}>
          <Text style={styles.postName}>{p.name}</Text>
          <Text style={styles.postTime}>{p.time}</Text>
        </View>
      </View>
      <Text style={styles.postText}>{p.text}</Text>
      {!compact && (
        <View style={styles.postActions}>
          <Text style={styles.postActionText}>↗ Share</Text>
        </View>
      )}
    </View>
  );
}

// ---------------- SCREENS ----------------
export function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const registering = mode === "register";

  const submit = async () => {
    const loginEmail = email.trim().toLowerCase();
    setNotice("");
    if (!isSupabaseConfigured) return Alert.alert("Supabase is not configured", "Copy .env.example to .env.local, add your project values, then restart Expo.");
    if (!loginEmail || !password) return Alert.alert("Missing details", "Enter your email address and password.");
    if (registering && !displayName.trim()) return Alert.alert("Add your name", "Enter the name other players will see.");
    if (registering && password.length < 6) return Alert.alert("Choose a longer password", "Your password must be at least 6 characters.");
    setLoading(true);
    const requestId = Symbol("auth-request");
    AuthScreen.activeRequest = requestId;
    try {
      const request = registering
        ? supabase.auth.signUp({ email: loginEmail, password, options: { data: { display_name: displayName.trim() } } })
        : supabase.auth.signInWithPassword({ email: loginEmail, password });
      const { data, error } = await request;
      if (AuthScreen.activeRequest !== requestId) return;
      if (error) {
        setNotice(error.message);
        return;
      }
      if (registering && !data.session) {
        setNotice("Account created. Check your email and confirm your address, then log in.");
        setMode("login");
      } else if (registering) {
        setNotice("Account created. Opening your dashboard…");
      }
    } catch (error) {
      if (AuthScreen.activeRequest !== requestId) return;
      setNotice(error?.message || "Something went wrong. Please try again.");
    } finally {
      if (AuthScreen.activeRequest === requestId) setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={[styles.screen, { backgroundColor: C.paper, padding: 26 }]}>
        <Avatar initials="DT" size={46} />
        <Text style={styles.loginTitle}>{registering ? "Join DinkTagum" : "Welcome back"}</Text>
        <Text style={styles.loginSub}>{registering ? "Create an account to find your next game." : "Log in to find your next game."}</Text>
        <View style={{ marginTop: 26 }}>
          {registering && <>
            <Text style={styles.label}>Display name</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholder="Your name" placeholderTextColor="rgba(6,35,29,0.38)" style={styles.input} editable={!loading} />
          </>}
          <Text style={[styles.label, registering && { marginTop: 14 }]}>Email address</Text>
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="rgba(6,35,29,0.38)" style={styles.input} editable={!loading} />
          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" placeholderTextColor="rgba(6,35,29,0.38)" style={styles.input} editable={!loading} />
        </View>
        <TouchableOpacity disabled={loading} style={[styles.btnPrimary, { marginTop: 22 }, loading && { opacity: 0.65 }]} onPress={submit}>
          {loading ? <ActivityIndicator color={C.ink} /> : <Text style={styles.btnPrimaryText}>{registering ? "Create account" : "Log in"}</Text>}
        </TouchableOpacity>
        {notice ? <Text style={styles.authNotice}>{notice}</Text> : null}
        <TouchableOpacity onPress={() => setMode(registering ? "login" : "register")} disabled={loading}>
          <Text style={styles.signupText}>{registering ? "Already have an account? " : "New to DinkTagum? "}<Text style={{ color: C.brand, fontWeight: "700" }}>{registering ? "Log in" : "Sign up"}</Text></Text>
        </TouchableOpacity>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function initialsFor(name, fallback = "DT") {
  const initials = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("");
  return initials.toUpperCase() || fallback;
}

function profileName(profile, user) {
  return profile?.display_name || user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Player";
}

function HomeTab({ openCourt, openChat, openNotifications, goTab, profile, user, courts, reservation, loading, error, posts, postsLoading, postsError }) {
  const name = profileName(profile, user);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <HeaderBar title={`Hi, ${name.split(" ")[0]} 👋`} subtitle={profile?.location || "Tagum City"} onChat={openChat} onNotifications={openNotifications} />

      <View style={styles.reservationCard}>
        <View>
          <Text style={styles.reservationLabel}>NEXT RESERVATION</Text>
          <Text style={styles.reservationName}>{loading ? "Loading reservation…" : reservation?.court?.name || "No upcoming reservations"}</Text>
          <Text style={styles.reservationTime}>{loading ? "" : reservation ? reservationTime(reservation) : "Reserve a court to see it here."}</Text>
        </View>
        {loading ? <ActivityIndicator color={C.volt} /> : <Icon glyph={reservation ? "✅" : "📅"} size={24} color={C.volt} />}
      </View>

      <View style={styles.quickActionsRow}>
        {[
          { glyph: "📍", label: "Find Court", tab: "courts" },
          { glyph: "👥", label: "Find Player", tab: "players" },
          { glyph: "💬", label: "Community", tab: "feed" },
        ].map((a) => (
          <TouchableOpacity key={a.label} onPress={() => goTab(a.tab)} style={styles.quickAction}>
            <Icon glyph={a.glyph} size={18} color={C.ink} />
            <Text style={styles.quickActionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
        <SectionTitle>Courts near Magugpo</SectionTitle>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 22 }} color={C.volt} /> : courts.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 20, marginTop: 10 }}>
        {courts.slice(0, 3).map((c) => <CourtCard key={c.id} c={c} compact onPress={() => openCourt(c)} />)}
      </ScrollView> : <Text style={styles.emptyState}>No courts are available yet.</Text>}
      {error ? <Text style={styles.dataError}>{error}</Text> : null}

      <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
        <SectionTitle>Community highlights</SectionTitle>
        <View style={{ marginTop: 10 }}>
          {postsLoading ? <ActivityIndicator color={C.volt} /> : posts.length ? posts.slice(0, 3).map((p) => <PostCard key={p.id} p={p} compact />) : <Text style={styles.emptyState}>No community posts yet.</Text>}
          {postsError ? <Text style={styles.dataError}>{postsError}</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

function CourtsTab({ openCourt, courts, loading, error, onFindNearby, locationLoading, locationMessage, hasLocation }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <HeaderBar title="Courts" subtitle={loading ? "Loading courts…" : `${courts.length} court${courts.length === 1 ? "" : "s"} available`} />
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <TouchableOpacity onPress={onFindNearby} disabled={locationLoading} style={styles.nearbyBtn}>
          <Text style={styles.nearbyBtnText}>{locationLoading ? "Finding nearby…" : hasLocation ? "Refresh nearby courts" : "Find courts near me"}</Text>
        </TouchableOpacity>
        {locationMessage ? <Text style={styles.locationMessage}>{locationMessage}</Text> : null}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
        <SectionTitle>Maps Showing Courts in Tagum</SectionTitle>
        <Text style={styles.mapDescription}>Shows pickleball courts in Tagum City.</Text>
      </View>
      <CourtsMap courts={courts} onCourtPress={openCourt} />

      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        {loading ? <ActivityIndicator color={C.volt} /> : courts.length ? courts.map((c) => <View key={c.id} style={{ marginBottom: 12 }}><CourtCard c={c} onPress={() => openCourt(c)} /></View>) : <Text style={styles.emptyState}>No courts in Tagum City have been added yet.</Text>}
        {error ? <Text style={styles.dataError}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

function CourtDetail({ court, onBack, reserve, reserving, loadBusySlots }) {
  const dayOptions = useMemo(() => buildDayOptions(3), []);
  const [dayKey, setDayKey] = useState(dayOptions[0].key);
  const [slot, setSlot] = useState("4:00 PM");
  const [notice, setNotice] = useState("");
  const [booked, setBooked] = useState(false);
  const [busyRanges, setBusyRanges] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const selectedDay = dayOptions.find((day) => day.key === dayKey) || dayOptions[0];
  const bookingDisabled = reserving || availabilityLoading || court.status === "Closed" || court.status === "Full";

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAvailabilityLoading(true);
      const ranges = await loadBusySlots(court.id, dayKey);
      if (!active) return;
      setBusyRanges(ranges);
      setAvailabilityLoading(false);
      setBooked(false);
      setNotice("");
    };
    load();
    return () => { active = false; };
  }, [court.id, dayKey, loadBusySlots]);

  useEffect(() => {
    if (!slotOverlapsBusy(selectedDay.date, slot, busyRanges)) return;
    const nextOpen = SLOTS.find((candidate) => !slotOverlapsBusy(selectedDay.date, candidate, busyRanges));
    if (nextOpen) setSlot(nextOpen);
  }, [busyRanges, selectedDay.date, slot]);

  const submitReservation = async () => {
    setNotice("");
    if (slotOverlapsBusy(selectedDay.date, slot, busyRanges)) {
      setNotice("That slot is already reserved. Pick another time.");
      return;
    }
    const success = await reserve(court, dayKey, slot);
    if (success) {
      setBooked(true);
      setNotice("Reservation submitted. We will notify you when it is confirmed.");
      const ranges = await loadBusySlots(court.id, dayKey);
      setBusyRanges(ranges);
    } else {
      setNotice("We could not submit this reservation. Please try again.");
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={styles.detailHero}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Icon glyph="←" size={18} color={C.paper} />
        </TouchableOpacity>
      </View>

      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailName}>{court.name}</Text>
            <Text style={styles.detailSub}>📍 {court.area} · {court.dist}</Text>
          </View>
          <StatusPill status={court.status} />
        </View>

        <View style={styles.statRow}>
          {[["⏰", court.hours], ["🏆", `${court.courts} courts`], ["★", `${court.rating} rating`]].map(([g, t], i) => (
            <View key={i} style={styles.statBox}>
              <Icon glyph={g} size={15} color={C.volt} />
              <Text style={styles.statText}>{t}</Text>
            </View>
          ))}
        </View>

        <View style={styles.courtInfoCard}>
          <Text style={styles.courtInfoLabel}>ADDRESS</Text>
          <Text style={styles.courtInfoText}>{court.address}</Text>
          {court.contactPhone ? <><Text style={styles.courtInfoLabel}>CONTACT</Text><Text style={styles.courtInfoText}>{court.contactName ? `${court.contactName} · ` : ""}{court.contactPhone}</Text></> : null}
          {court.hourlyRate !== null ? <><Text style={styles.courtInfoLabel}>HOURLY RATE</Text><Text style={styles.courtInfoText}>₱{court.hourlyRate.toFixed(2)} per hour</Text></> : null}
          {court.scheduleNote ? <><Text style={styles.courtInfoLabel}>SCHEDULE</Text><Text style={styles.courtInfoText}>{court.scheduleNote}</Text></> : null}
        </View>

        {court.photoUrls.length ? <View style={{ marginTop: 16 }}><SectionTitle>Photos</SectionTitle><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>{court.photoUrls.map((uri, index) => <Image key={`${uri}-${index}`} source={{ uri }} style={styles.courtGalleryImage} />)}</ScrollView></View> : null}

        <View style={styles.amenitiesRow}>
          {court.amenities.map((a) => (
            <View key={a} style={styles.amenityPill}><Text style={styles.amenityText}>{a}</Text></View>
          ))}
        </View>

        <DashedDivider />

        <SectionTitle>Reserve a slot</SectionTitle>
        {court.status === "Full" || court.status === "Closed" ? (
          <Text style={[styles.dataError, { marginHorizontal: 0 }]}>This court is {court.status.toLowerCase()} and cannot accept new reservations.</Text>
        ) : null}
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          {dayOptions.map((day) => (
            <TouchableOpacity key={day.key} onPress={() => setDayKey(day.key)} style={[styles.dateChip, dayKey === day.key && { backgroundColor: C.volt }]}>
              <Text style={[styles.dateChipText, dayKey === day.key && { color: C.ink }]}>{day.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {availabilityLoading ? <ActivityIndicator color={C.volt} style={{ marginTop: 16 }} /> : (
          <View style={styles.slotGrid}>
            {SLOTS.map((s) => {
              const isBooked = slotOverlapsBusy(selectedDay.date, s, busyRanges);
              const active = slot === s;
              return (
                <TouchableOpacity
                  key={s}
                  disabled={isBooked || bookingDisabled}
                  onPress={() => setSlot(s)}
                  style={[
                    styles.slotBtn,
                    { borderColor: active ? C.volt : C.line },
                    active && { backgroundColor: "rgba(227,239,38,0.15)" },
                    isBooked && { backgroundColor: "rgba(255,253,238,0.04)" },
                  ]}
                >
                  <Text style={[
                    styles.slotText,
                    { color: isBooked ? "rgba(255,253,238,0.25)" : active ? C.volt : C.paper },
                    isBooked && { textDecorationLine: "line-through" },
                  ]}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {notice ? <Text style={[styles.authNotice, { color: C.mist, textAlign: "left", marginTop: 12 }]}>{notice}</Text> : null}
      </View>

      <View style={{ padding: 20 }}>
        <TouchableOpacity disabled={bookingDisabled || slotOverlapsBusy(selectedDay.date, slot, busyRanges)} style={[styles.btnPrimary, (bookingDisabled || slotOverlapsBusy(selectedDay.date, slot, busyRanges)) && { opacity: 0.55 }]} onPress={submitReservation}>
          <Text style={styles.btnPrimaryText}>
            {booked ? `✓ Reserved for ${slot}` : `Book ${selectedDay.label} at ${slot}`}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function PlayersTab({ user }) {
  const [sent, setSent] = useState({});
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [gameType, setGameType] = useState("All");

  useEffect(() => {
    let active = true;
    const loadPlayers = async () => {
      if (!supabase) return;
      setLoading(true);
      const { data, error: directoryError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, skill_level, preferred_game_type, location")
        .eq("is_directory_visible", true)
        .neq("id", user?.id || "")
        .order("display_name", { ascending: true });
      if (!active) return;
      if (directoryError) setError(`Player directory could not be loaded: ${directoryError.message}`);
      else setPlayers(data || []);
      setLoading(false);
    };
    loadPlayers();
    return () => { active = false; };
  }, [user?.id]);

  const visiblePlayers = players.filter((player) => {
    const nameMatches = (player.display_name || "").toLowerCase().includes(query.trim().toLowerCase());
    const typeMatches = gameType === "All" || player.preferred_game_type === gameType || player.preferred_game_type === "Either";
    return nameMatches && typeMatches;
  });
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <HeaderBar title="Find Players" subtitle={loading ? "Loading player directory..." : `${visiblePlayers.length} player${visiblePlayers.length === 1 ? "" : "s"} available`} />
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search players" placeholderTextColor={C.textDim} style={styles.profileInput} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 20, marginTop: 14 }}>
        {["All", "Singles", "Doubles"].map((type) => (
          <TouchableOpacity key={type} onPress={() => setGameType(type)} style={[styles.chip, gameType === type && { backgroundColor: C.volt, borderWidth: 0 }]}>
            <Text style={[styles.chipText, gameType === type && { color: C.ink }]}>{type}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        {loading ? <ActivityIndicator color={C.volt} /> : null}
        {error ? <Text style={styles.dataError}>{error}</Text> : null}
        {!loading && !error && !visiblePlayers.length ? <Text style={styles.emptyState}>No visible players match your search yet.</Text> : null}
        {visiblePlayers.map((p) => (
          <View key={p.id} style={styles.playerRow}>
            <Avatar initials={initialsFor(p.display_name)} uri={p.avatar_url} size={46} ring />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.playerName}>{p.display_name}</Text>
              <Text style={styles.playerSub}>{p.preferred_game_type || "Doubles"} · {p.location || "Tagum City"}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={styles.levelBadge}><Text style={styles.levelBadgeText}>{p.skill_level || "3.0"}</Text></View>
              <TouchableOpacity
                onPress={() => setSent({ ...sent, [p.id]: true })}
                style={[styles.connectBtn, sent[p.id] && { backgroundColor: "transparent" }]}
              >
                <Text style={[styles.connectBtnText, sent[p.id] && { color: C.textDim }]}>
                  {sent[p.id] ? "Requested" : "Connect"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function FeedTab({ user, profile, posts, loading, error, createPost }) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;
    setSubmitting(true);
    const success = await createPost(trimmedBody);
    setSubmitting(false);
    if (success) setBody("");
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <HeaderBar title="Community" subtitle="Tagum City pickleball feed" />
      <View style={{ paddingHorizontal: 20, marginTop: 14 }}>
        <View style={styles.composeBar}>
          <Avatar initials={initialsFor(profileName(profile, user))} uri={profile?.avatar_url} size={30} />
          <TextInput value={body} onChangeText={setBody} maxLength={2000} multiline placeholder="Share your game..." placeholderTextColor={C.textDim} style={styles.composeInput} />
          <TouchableOpacity disabled={submitting || !body.trim()} onPress={submit} style={[styles.postButton, (submitting || !body.trim()) && { opacity: 0.45 }]}><Text style={styles.postButtonText}>{submitting ? "..." : "Post"}</Text></TouchableOpacity>
        </View>
      </View>
      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        {loading ? <ActivityIndicator color={C.volt} /> : posts.length ? posts.map((p) => <View key={p.id} style={{ marginBottom: 12 }}><PostCard p={p} /></View>) : <Text style={styles.emptyState}>Be the first to share a game update.</Text>}
        {error ? <Text style={styles.dataError}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

function GameHistoryTab({ user }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadHistory = async () => {
      if (!supabase || !user?.id) { setLoading(false); return; }
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("game_records")
        .select("id, played_on, opponents, player_score, opponent_score, result")
        .eq("player_id", user.id)
        .order("played_on", { ascending: false })
        .limit(100);
      if (!active) return;
      if (queryError) setError(`Match history could not be loaded: ${queryError.message}`);
      else setGames(data || []);
      setLoading(false);
    };
    loadHistory();
    return () => { active = false; };
  }, [user?.id]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
      <Text style={styles.headerTitle}>Game History</Text>
      <Text style={styles.headerSubtitle}>Your recorded matches and results</Text>
      <View style={{ marginTop: 20 }}>
        {loading ? <ActivityIndicator color={C.volt} /> : null}
        {!loading && !error && !games.length ? <Text style={styles.emptyState}>No games recorded yet. Your completed matches will appear here.</Text> : null}
        {games.map((game) => <View key={game.id} style={styles.matchRow}>
          <View><Text style={styles.matchVs}>vs {game.opponents || "Opponent"}</Text><Text style={styles.playerSub}>{new Date(game.played_on).toLocaleDateString()}</Text></View>
          <Text style={[styles.matchScore, { color: game.result === "win" ? C.volt : C.textDim }]}>{game.player_score}–{game.opponent_score} · {game.result === "win" ? "Win" : "Loss"}</Text>
        </View>)}
        {error ? <Text style={styles.dataError}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

function NotificationCenter({ user, onBack }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadNotifications = async () => {
      if (!supabase || !user?.id) return;
      setLoading(true);
      const { data, error: queryError } = await supabase.from("notifications").select("id, kind, title, body, is_read, created_at").eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (queryError) setError("Notifications could not be loaded. Confirm migrations are applied, then try again.");
      else { setNotifications(data || []); setError(""); }
      setLoading(false);
    };
    loadNotifications();
    return () => { active = false; };
  }, [user?.id]);

  const markRead = async (notification) => {
    if (notification.is_read || !supabase) return;
    const { error: updateError } = await supabase.from("notifications").update({ is_read: true }).eq("id", notification.id).eq("recipient_id", user.id);
    if (updateError) { Alert.alert("Could not update notification", updateError.message); return; }
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
  };

  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
    <TouchableOpacity onPress={onBack} style={styles.inlineBack}><Icon glyph="←" size={20} color={C.paper} /><Text style={styles.inlineBackText}>Back</Text></TouchableOpacity>
    <Text style={styles.headerTitle}>Notifications</Text>
    <Text style={styles.headerSubtitle}>Updates about your games and reservations</Text>
    <View style={{ marginTop: 18 }}>
      {loading ? <ActivityIndicator color={C.volt} /> : notifications.length ? notifications.map((notification) => <TouchableOpacity key={notification.id} onPress={() => markRead(notification)} style={[styles.notificationCard, !notification.is_read && styles.notificationUnread]}><Text style={styles.notificationKind}>{notification.kind.replace("_", " ")}</Text><Text style={styles.notificationTitle}>{notification.title}</Text>{notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}<Text style={styles.notificationTime}>{relativeTime(notification.created_at)}{notification.is_read ? "" : " · Tap to mark read"}</Text></TouchableOpacity>) : <Text style={styles.emptyState}>You’re all caught up.</Text>}
      {error ? <Text style={styles.dataError}>{error}</Text> : null}
    </View>
  </ScrollView>;
}

function AdminTab({ user, onBack }) {
  const [authorized, setAuthorized] = useState(null);
  const [counts, setCounts] = useState(null);
  const [reportedPosts, setReportedPosts] = useState([]);
  const [courts, setCourts] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadAdminDashboard = async () => {
      if (!supabase) return;
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const isAdmin = !authError && authData.user?.id === user?.id && authData.user?.app_metadata?.role === "admin";
      if (!active) return;
      setAuthorized(isAdmin);
      if (!isAdmin) return;
      const [courtCount, reservations, reportCount, postRows, courtRows, profileRows] = await Promise.all([
        supabase.from("courts").select("id", { count: "exact", head: true }),
        supabase.from("reservations").select("id", { count: "exact", head: true }),
        supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("is_reported", true),
        supabase.from("community_posts").select("id, body, author_id, created_at").eq("is_reported", true).order("created_at", { ascending: false }).limit(20),
        supabase.from("courts").select("id, name, status").order("name", { ascending: true }).limit(50),
        supabase.from("profiles").select("id, display_name, is_directory_visible").order("display_name", { ascending: true }).limit(50),
      ]);
      if (!active) return;
      const queryError = [courtCount.error, reservations.error, reportCount.error, postRows.error, courtRows.error, profileRows.error].find(Boolean);
      if (queryError) setError("Admin data could not be loaded. Confirm migration RLS policies and refresh your sign-in token.");
      else {
        setCounts({ courts: courtCount.count || 0, reservations: reservations.count || 0, reports: reportCount.count || 0 });
        setReportedPosts(postRows.data || []);
        setCourts(courtRows.data || []);
        setProfiles(profileRows.data || []);
      }
    };
    loadAdminDashboard();
    return () => { active = false; };
  }, [user?.id]);

  const update = async (id, table, changes, apply) => {
    if (!supabase) return;
    setSavingId(id);
    const { error: updateError } = await supabase.from(table).update(changes).eq("id", id);
    setSavingId("");
    if (updateError) { Alert.alert("Could not save change", updateError.message); return; }
    apply();
  };

  return <ScrollView style={styles.screen} contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
    <TouchableOpacity onPress={onBack} style={styles.inlineBack}><Icon glyph="←" size={20} color={C.paper} /><Text style={styles.inlineBackText}>Back</Text></TouchableOpacity>
    <Text style={styles.headerTitle}>Admin</Text>
    <Text style={styles.headerSubtitle}>Court, reservation, and community moderation</Text>
    {authorized === null ? <ActivityIndicator color={C.volt} style={{ marginTop: 28 }} /> : !authorized ? <Text style={styles.dataError}>This screen is restricted to administrators.</Text> : <View style={{ marginTop: 20 }}>
      <View style={styles.adminGrid}>{[["Courts", counts?.courts], ["Reservations", counts?.reservations], ["Reported posts", counts?.reports]].map(([label, value]) => <View key={label} style={styles.adminStatCard}><Text style={styles.statValue}>{value ?? "…"}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
      <Text style={styles.adminIntro}>Review reported posts, control court availability, and manage directory visibility. Every update is authorized by the database role policy.</Text>
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Reported posts</Text>
      {reportedPosts.length ? reportedPosts.map((post) => <View key={post.id} style={styles.adminAction}><Text style={styles.adminActionTitle}>{post.body}</Text><Text style={styles.adminActionHint}>Author: {post.author_id}</Text><TouchableOpacity disabled={savingId === post.id} onPress={() => update(post.id, "community_posts", { is_reported: false }, () => { setReportedPosts((items) => items.filter((item) => item.id !== post.id)); setCounts((value) => ({ ...value, reports: Math.max(0, value.reports - 1) })); })} style={styles.connectBtn}><Text style={styles.connectBtnText}>{savingId === post.id ? "Saving…" : "Restore post"}</Text></TouchableOpacity></View>) : <Text style={styles.emptyState}>No posts are awaiting moderation.</Text>}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Court listings</Text>
      {courts.map((court) => <View key={court.id} style={styles.adminAction}><Text style={styles.adminActionTitle}>{court.name}</Text><Text style={styles.adminActionHint}>Status: {court.status}</Text><TouchableOpacity disabled={savingId === court.id} onPress={() => { const status = court.status === "Closed" ? "Available" : "Closed"; update(court.id, "courts", { status }, () => setCourts((items) => items.map((item) => item.id === court.id ? { ...item, status } : item))); }} style={styles.connectBtn}><Text style={styles.connectBtnText}>{savingId === court.id ? "Saving…" : court.status === "Closed" ? "Reopen" : "Close court"}</Text></TouchableOpacity></View>)}
      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Directory permissions</Text>
      {profiles.map((profile) => <View key={profile.id} style={styles.adminAction}><Text style={styles.adminActionTitle}>{profile.display_name || "Unnamed player"}</Text><Text style={styles.adminActionHint}>{profile.is_directory_visible ? "Visible in directory" : "Hidden from directory"}</Text><TouchableOpacity disabled={savingId === profile.id} onPress={() => { const is_directory_visible = !profile.is_directory_visible; update(profile.id, "profiles", { is_directory_visible }, () => setProfiles((items) => items.map((item) => item.id === profile.id ? { ...item, is_directory_visible } : item))); }} style={styles.connectBtn}><Text style={styles.connectBtnText}>{savingId === profile.id ? "Saving…" : profile.is_directory_visible ? "Hide player" : "Show player"}</Text></TouchableOpacity></View>)}
      {error ? <Text style={styles.dataError}>{error}</Text> : null}
    </View>}
  </ScrollView>;
}

function ProfileTab({ onSignOut, profile, user, saveProfile, savingProfile, isAdmin, openAdmin }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [skillLevel, setSkillLevel] = useState("3.0");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [preferredGameType, setPreferredGameType] = useState("Doubles");
  const [directoryVisible, setDirectoryVisible] = useState(true);
  const [gameRecords, setGameRecords] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState("");

  useEffect(() => {
    setDisplayName(profileName(profile, user));
    setLocation(profile?.location || "Tagum City");
    setSkillLevel(String(profile?.skill_level || "3.0"));
    setAvatarUrl(profile?.avatar_url || "");
    setPreferredGameType(profile?.preferred_game_type || "Doubles");
    setDirectoryVisible(profile?.is_directory_visible !== false);
  }, [profile, user]);

  useEffect(() => {
    let active = true;
    const loadGameRecords = async () => {
      if (!supabase || !user?.id) return;
      setGamesLoading(true);
      const { data, error } = await supabase.from("game_records").select("id, played_on, opponents, player_score, opponent_score, result").eq("player_id", user.id).order("played_on", { ascending: false }).limit(1000);
      if (!active) return;
      if (error) setGamesError(`Match history could not be loaded: ${error.message}`);
      else { setGameRecords(data || []); setGamesError(""); }
      setGamesLoading(false);
    };
    loadGameRecords();
    return () => { active = false; };
  }, [user?.id]);

  const save = async () => {
    const result = await saveProfile({ display_name: displayName, location, skill_level: skillLevel, avatar_url: avatarUrl, preferred_game_type: preferredGameType, is_directory_visible: directoryVisible });
    if (result) setEditing(false);
  };
  const profileStats = calculateProfileStats(gameRecords);
  const stats = [
    { label: "Matches", value: String(profileStats.matchesPlayed) }, { label: "W/L ratio", value: profileStats.winLossRatio },
    { label: "Points", value: String(profileStats.pointsFor) }, { label: "Win rate", value: profileStats.winRate === null ? "—" : `${profileStats.winRate}%` },
  ];
  const history = gameRecords.slice(0, 6).reverse().map((game) => ({ h: Math.max(3, Math.round((game.player_score / 11) * 10)), label: game.result === "win" ? "W" : "L" }));
  const matches = matchHistoryFromRecords(gameRecords);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 30 }}>
      <View style={{ alignItems: "flex-end", padding: 20, paddingBottom: 0 }}>
        <IconBtn glyph="✎" onPress={() => setEditing((value) => !value)} />
      </View>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 20 }}>
        <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn}><Text style={styles.signOutText}>Sign out</Text></TouchableOpacity>
        {isAdmin ? <TouchableOpacity onPress={openAdmin} style={[styles.signOutBtn, { marginTop: 8 }]}><Text style={styles.signOutText}>Admin interface</Text></TouchableOpacity> : null}
      </View>
      <View style={{ alignItems: "center", paddingHorizontal: 20 }}>
        <Avatar initials={initialsFor(profileName(profile, user))} uri={profile?.avatar_url} size={72} ring />
        <Text style={styles.profileName}>{profileName(profile, user)}</Text>
        {editing ? <View style={styles.profileForm}>
          <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor="rgba(255,253,238,0.5)" style={styles.profileInput} />
          <TextInput value={location} onChangeText={setLocation} placeholder="Location" placeholderTextColor="rgba(255,253,238,0.5)" style={styles.profileInput} />
          <TextInput value={skillLevel} onChangeText={setSkillLevel} keyboardType="decimal-pad" placeholder="Skill level (e.g. 3.5)" placeholderTextColor="rgba(255,253,238,0.5)" style={styles.profileInput} />
          <TextInput value={avatarUrl} onChangeText={setAvatarUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Avatar image URL (optional)" placeholderTextColor="rgba(255,253,238,0.5)" style={styles.profileInput} />
          <Text style={styles.profileFieldLabel}>Preferred game type</Text>
          <View style={styles.choiceRow}>
            {["Singles", "Doubles", "Either"].map((type) => <TouchableOpacity key={type} onPress={() => setPreferredGameType(type)} style={[styles.choiceChip, preferredGameType === type && styles.choiceChipActive]}><Text style={[styles.choiceChipText, preferredGameType === type && styles.choiceChipTextActive]}>{type}</Text></TouchableOpacity>)}
          </View>
          <View style={styles.visibilityRow}>
            <View style={{ flex: 1 }}><Text style={styles.profileFieldLabel}>Show me in the player directory</Text><Text style={styles.profileHint}>Other signed-in players can find your profile.</Text></View>
            <Switch value={directoryVisible} onValueChange={setDirectoryVisible} trackColor={{ false: C.surface2, true: C.brand }} thumbColor={directoryVisible ? C.volt : C.paper} />
          </View>
          <TouchableOpacity disabled={savingProfile} onPress={save} style={[styles.saveProfileBtn, savingProfile && { opacity: 0.6 }]}><Text style={styles.saveProfileText}>{savingProfile ? "Saving…" : "Save profile"}</Text></TouchableOpacity>
        </View> : <>
          <Text style={styles.profileSub}>Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "today"} · {profile?.location || "Tagum City"}</Text>
          <View style={styles.skillBadge}><Text style={styles.skillBadgeText}>Skill level {profile?.skill_level || "3.0"} · {Number(profile?.skill_level || 3) >= 3.5 ? "Intermediate" : "Developing"}</Text></View>
        </>}
      </View>

      <View style={styles.statsGrid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
        <SectionTitle>Skill tracker</SectionTitle>
        <Text style={styles.trendText}>{gamesLoading ? "Loading match results..." : gameRecords.length ? `${profileStats.wins} win${profileStats.wins === 1 ? "" : "s"} from ${profileStats.matchesPlayed} recorded match${profileStats.matchesPlayed === 1 ? "" : "es"}` : "Record matches to see your progress."}</Text>
        <View style={styles.chart}>
          {history.length ? history.map((h, i) => (
            <View key={i} style={styles.chartCol}>
              <View style={{ flex: 1, justifyContent: "flex-end", width: "100%" }}>
                <View style={{ height: h.h * 8, borderRadius: 5, backgroundColor: h.label === "W" ? C.volt : "rgba(255,253,238,0.2)" }} />
              </View>
              <Text style={styles.chartLabel}>{h.label}</Text>
            </View>
          )) : <Text style={styles.emptyState}>No match results yet.</Text>}
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
        <SectionTitle>Recent matches</SectionTitle>
        <View style={{ marginTop: 10 }}>
          {matches.map((match) => (
            <View key={match.id} style={styles.matchRow}>
              <Text style={styles.matchVs}>vs. {match.opponent}</Text>
              <Text style={[styles.matchScore, { color: match.result === "win" ? C.volt : C.textDim }]}>{match.playerScore}–{match.opponentScore}</Text>
            </View>
          ))}
          {!gamesLoading && !matches.length ? <Text style={styles.emptyState}>No matches recorded yet.</Text> : null}
          {gamesError ? <Text style={styles.dataError}>{gamesError}</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}

function ChatList({ onBack, openThread }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.chatListHeader}>
        <TouchableOpacity onPress={onBack}><Icon glyph="←" size={20} color={C.paper} /></TouchableOpacity>
        <Text style={styles.chatListTitle}>Chats</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
        {CONVOS.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => openThread(c)} style={styles.convoRow}>
            <Avatar initials={c.initials} size={42} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.convoName}>{c.name}</Text>
                <Text style={styles.convoTime}>{c.time}</Text>
              </View>
              <Text style={[styles.convoLast, { color: c.unread ? C.mist : C.textDim }]}>{c.last}</Text>
            </View>
            {c.unread && <View style={styles.unreadDot} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ChatThread({ convo, onBack }) {
  return (
    <SafeAreaView style={[styles.screen, { flex: 1 }]}>
      <View style={styles.threadHeader}>
        <TouchableOpacity onPress={onBack}><Icon glyph="←" size={20} color={C.paper} /></TouchableOpacity>
        <Avatar initials={convo.initials} size={34} />
        <Text style={styles.threadName}>{convo.name}</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>
        {THREAD.map((m, i) => (
          <View key={i} style={[
            styles.bubble,
            m.mine ? styles.bubbleMine : styles.bubbleTheirs,
          ]}>
            <Text style={{ color: m.mine ? C.ink : C.paper, fontSize: 12.5 }}>{m.text}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.composeRow}>
        <View style={styles.messageInput}><Text style={{ color: C.textDim, fontSize: 12.5 }}>Message...</Text></View>
        <View style={styles.sendBtn}><Icon glyph="➤" size={16} color={C.ink} /></View>
      </View>
    </SafeAreaView>
  );
}

// ---------------- ROUTE SCREENS ----------------
function useGoTab() {
  const router = useRouter();
  const { setDetail, setChatView, setNotificationView, setAdminView } = useAppData();
  return (t) => {
    const routes = { home: "/", courts: "/courts", history: "/history", directory: "/directory", players: "/directory", feed: "/feed", profile: "/profile" };
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
    router.navigate(routes[t] || "/");
  };
}

function ScreenFrame({ children }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <StatusBar barStyle="light-content" />
      {children}
    </View>
  );
}

export function HomeScreen() {
  const data = useAppData();
  const goTab = useGoTab();
  return (
    <ScreenFrame>
      <HomeTab
        openCourt={data.setDetail}
        openChat={() => data.setChatView("list")}
        openNotifications={() => data.setNotificationView(true)}
        goTab={goTab}
        profile={data.profile}
        user={data.session.user}
        courts={data.courts}
        reservation={data.reservation}
        loading={data.dashboardLoading}
        error={data.dashboardError}
        posts={data.communityPosts}
        postsLoading={data.postsLoading}
        postsError={data.postsError}
      />
    </ScreenFrame>
  );
}

export function CourtsScreen() {
  const data = useAppData();
  return (
    <ScreenFrame>
      <CourtsTab
        openCourt={data.setDetail}
        courts={data.courts}
        loading={data.dashboardLoading}
        error={data.dashboardError}
        onFindNearby={data.findNearbyCourts}
        locationLoading={data.locationLoading}
        locationMessage={data.locationMessage}
        hasLocation={data.hasLocation}
      />
    </ScreenFrame>
  );
}

export function DirectoryScreen() {
  const data = useAppData();
  return <ScreenFrame><PlayersTab user={data.session.user} /></ScreenFrame>;
}

export function HistoryScreen() {
  const data = useAppData();
  return <ScreenFrame><GameHistoryTab user={data.session.user} /></ScreenFrame>;
}

export function FeedScreen() {
  const data = useAppData();
  return (
    <ScreenFrame>
      <FeedTab
        user={data.session.user}
        profile={data.profile}
        posts={data.communityPosts}
        loading={data.postsLoading}
        error={data.postsError}
        createPost={data.createCommunityPost}
      />
    </ScreenFrame>
  );
}

export function ProfileScreen() {
  const data = useAppData();
  return (
    <ScreenFrame>
      <ProfileTab
        onSignOut={data.signOut}
        profile={data.profile}
        user={data.session.user}
        saveProfile={data.saveProfile}
        savingProfile={data.savingProfile}
        isAdmin={data.isAdmin}
        openAdmin={() => data.setAdminView(true)}
      />
    </ScreenFrame>
  );
}

export function AppOverlays() {
  const data = useAppData();
  if (!data.session) return null;

  let content = null;
  if (data.notificationView) content = <NotificationCenter user={data.session.user} onBack={() => data.setNotificationView(false)} />;
  else if (data.adminView) content = <AdminTab user={data.session.user} onBack={() => data.setAdminView(false)} />;
  else if (data.chatView === "list") content = <ChatList onBack={() => data.setChatView(null)} openThread={(c) => data.setChatView(c)} />;
  else if (data.chatView) content = <ChatThread convo={data.chatView} onBack={() => data.setChatView("list")} />;
  else if (data.detail) content = <CourtDetail court={data.detail} onBack={() => data.setDetail(null)} reserve={data.createReservation} reserving={data.reserving} loadBusySlots={data.loadBusySlots} />;
  if (!content) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      <View style={{ flex: 1, backgroundColor: C.ink }}>
        <StatusBar barStyle="light-content" />
        {content}
      </View>
    </View>
  );
}

// ---------------- STYLES ----------------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ink },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 11, fontWeight: "700" },
  sectionTitle: { color: C.paper, fontSize: 15.5, fontWeight: "600" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 20 },
  headerTitle: { color: C.paper, fontSize: 21, fontWeight: "600" },
  headerSubtitle: { color: C.textDim, fontSize: 12.5, marginTop: 2 },

  logoBadge: { width: 84, height: 84, borderRadius: 24, backgroundColor: C.mist, alignItems: "center", justifyContent: "center", marginBottom: 22 },
  brandTitle: { color: C.paper, fontSize: 30, fontWeight: "700" },
  brandTagline: { color: C.textDim, fontSize: 14.5, lineHeight: 22, marginTop: 14, maxWidth: 260, textAlign: "center" },
  dot: { width: 6, height: 6, borderRadius: 4, marginHorizontal: 3 },
  btnPrimary: { width: "100%", paddingVertical: 15, borderRadius: 16, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
  btnPrimaryText: { color: C.ink, fontSize: 15, fontWeight: "700" },

  loginTitle: { color: C.ink, fontSize: 26, fontWeight: "700", marginTop: 22 },
  loginSub: { color: "rgba(6,35,29,0.55)", fontSize: 13.5, marginTop: 4 },
  label: { fontSize: 11.5, fontWeight: "600", color: "rgba(6,35,29,0.55)", marginBottom: 6 },
  input: { backgroundColor: C.mist, borderRadius: 12, padding: 13 },
  authLoading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.ink },
  authLoadingText: { color: C.mist, marginTop: 12, fontSize: 14 },
  authNotice: { color: C.brand, fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 14 },
  signOutBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  signOutText: { color: C.mist, fontSize: 12, fontWeight: "700" },
  forgot: { textAlign: "right", fontSize: 12.5, color: C.brand, marginTop: 10, fontWeight: "600" },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(6,35,29,0.12)" },
  dividerText: { fontSize: 11.5, color: "rgba(6,35,29,0.4)", marginHorizontal: 10 },
  socialBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: "rgba(6,35,29,0.15)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  signupText: { textAlign: "center", fontSize: 13, color: "rgba(6,35,29,0.6)", marginTop: 30 },

  reservationCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.brand, borderRadius: 18, padding: 16, marginHorizontal: 20, marginTop: 16 },
  reservationLabel: { color: C.mist, fontSize: 11, fontWeight: "700" },
  reservationName: { color: C.paper, fontSize: 16, fontWeight: "600", marginTop: 4 },
  reservationTime: { color: C.textDim, fontSize: 12.5, marginTop: 2 },
  emptyState: { color: C.textDim, fontSize: 12.5, marginHorizontal: 20, marginTop: 12 },
  dataError: { color: C.butter, fontSize: 11.5, lineHeight: 16, marginHorizontal: 20, marginTop: 12 },

  quickActionsRow: { flexDirection: "row", paddingHorizontal: 20, marginTop: 16 },
  quickAction: { flex: 1, backgroundColor: C.mist, borderRadius: 14, paddingVertical: 12, alignItems: "center", marginRight: 8 },
  quickActionLabel: { fontSize: 10.5, fontWeight: "700", color: C.ink, marginTop: 6 },
  nearbyBtn: { alignSelf: "flex-start", backgroundColor: C.volt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginTop: 14, minHeight: 40, justifyContent: "center" },
  nearbyBtnText: { color: C.ink, fontSize: 12, fontWeight: "700" },
  locationMessage: { color: C.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  mapDescription: { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 },

  courtCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14, width: 260, marginRight: 20 },
  courtThumb: { height: 74, borderRadius: 12, marginBottom: 10, backgroundColor: C.brand },
  courtName: { color: C.paper, fontSize: 14, fontWeight: "600" },
  courtSub: { color: C.textDim, fontSize: 12, marginTop: 3 },
  courtFooterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },

  postCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14 },
  postName: { color: C.paper, fontSize: 13, fontWeight: "600" },
  postTime: { color: C.textDim, fontSize: 10.5 },
  postText: { color: C.paper, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  postTag: { color: C.volt, fontSize: 11, fontWeight: "600", marginTop: 4 },
  postActions: { flexDirection: "row", marginTop: 12, borderTopWidth: 1, borderColor: C.line, paddingTop: 10 },
  postActionText: { color: C.textDim, fontSize: 11.5, marginRight: 18 },

  searchBar: { backgroundColor: C.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: C.line },
  searchPlaceholder: { color: C.textDim, fontSize: 13, marginLeft: 8 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  chipText: { color: C.textDim, fontSize: 11.5, fontWeight: "600" },
  mapPlaceholder: { marginHorizontal: 20, marginTop: 16, height: 130, borderRadius: 16, backgroundColor: C.brand, alignItems: "flex-end", justifyContent: "flex-end", padding: 10 },
  mapLabel: { fontSize: 10, color: C.ink, backgroundColor: C.paper, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  detailHero: { height: 170, backgroundColor: C.brand, justifyContent: "flex-start" },
  backBtn: { position: "absolute", top: 18, left: 18, width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(6,35,29,0.7)", alignItems: "center", justifyContent: "center" },
  detailName: { color: C.paper, fontSize: 20, fontWeight: "700" },
  detailSub: { color: C.textDim, fontSize: 12.5, marginTop: 4 },
  courtInfoCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginTop: 16 },
  courtInfoLabel: { color: C.volt, fontSize: 9.5, fontWeight: "700", marginTop: 8 },
  courtInfoText: { color: C.paper, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  courtGalleryImage: { width: 172, height: 116, borderRadius: 12, marginRight: 10, backgroundColor: C.surface2 },
  statRow: { flexDirection: "row", marginTop: 16 },
  statBox: { flex: 1, backgroundColor: C.surface, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: C.line, marginRight: 8 },
  statText: { color: C.textDim, fontSize: 10.5, marginTop: 5, textAlign: "center" },
  amenitiesRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  amenityPill: { borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 },
  amenityText: { color: C.mist, fontSize: 11 },
  dateChip: { backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  dateChipText: { color: C.paper, fontSize: 12, fontWeight: "600" },
  slotGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, justifyContent: "space-between" },
  slotBtn: { width: "31%", borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center", marginBottom: 8 },
  slotText: { fontSize: 12, fontWeight: "600" },

  playerRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 12 },
  playerName: { color: C.paper, fontSize: 14.5, fontWeight: "600" },
  playerSub: { color: C.textDim, fontSize: 11.5, marginTop: 3 },
  levelBadge: { backgroundColor: C.volt, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  levelBadgeText: { color: C.ink, fontSize: 11, fontWeight: "700" },
  connectBtn: { backgroundColor: C.brand, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6 },
  connectBtnText: { color: C.mist, fontSize: 11, fontWeight: "700" },

  composeBar: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center" },
  composePlaceholder: { color: C.textDim, fontSize: 12.5, flex: 1, marginLeft: 10 },
  composeInput: { flex: 1, color: C.paper, fontSize: 12.5, marginLeft: 10, marginRight: 8, maxHeight: 96, paddingVertical: 0 },
  postButton: { backgroundColor: C.volt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  postButtonText: { color: C.ink, fontSize: 11, fontWeight: "700" },
  inlineBack: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginBottom: 18 },
  inlineBackText: { color: C.paper, fontSize: 12.5, fontWeight: "700", marginLeft: 7 },
  notificationCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  notificationUnread: { borderColor: C.volt, backgroundColor: C.surface2 },
  notificationKind: { color: C.volt, textTransform: "uppercase", fontSize: 9.5, fontWeight: "700" },
  notificationTitle: { color: C.paper, fontSize: 13.5, fontWeight: "700", marginTop: 5 },
  notificationBody: { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 },
  notificationTime: { color: C.textDim, fontSize: 10.5, marginTop: 8 },
  adminGrid: { flexDirection: "row", gap: 8 },
  adminStatCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  adminIntro: { color: C.textDim, fontSize: 12, lineHeight: 18, marginTop: 18 },
  adminAction: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginTop: 10 },
  adminActionTitle: { color: C.paper, fontSize: 13, fontWeight: "700" },
  adminActionHint: { color: C.textDim, fontSize: 11, marginTop: 3 },

  profileName: { color: C.paper, fontSize: 19, fontWeight: "700", marginTop: 12 },
  profileSub: { color: C.textDim, fontSize: 12, marginTop: 3 },
  profileForm: { width: "100%", marginTop: 14, gap: 8 },
  profileInput: { width: "100%", backgroundColor: C.surface, color: C.paper, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13 },
  profileFieldLabel: { color: C.mist, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
  profileHint: { color: C.textDim, fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  choiceChipActive: { backgroundColor: C.volt, borderColor: C.volt },
  choiceChipText: { color: C.mist, fontSize: 11.5, fontWeight: "700" },
  choiceChipTextActive: { color: C.ink },
  visibilityRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 2 },
  saveProfileBtn: { alignSelf: "center", backgroundColor: C.volt, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, marginTop: 2 },
  saveProfileText: { color: C.ink, fontSize: 12, fontWeight: "700" },
  skillBadge: { backgroundColor: C.volt, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, marginTop: 10 },
  skillBadgeText: { color: C.ink, fontSize: 12, fontWeight: "700" },
  statsGrid: { flexDirection: "row", paddingHorizontal: 20, marginTop: 20 },
  statCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingVertical: 10, alignItems: "center", marginRight: 8 },
  statValue: { color: C.volt, fontSize: 16, fontWeight: "700" },
  statLabel: { color: C.textDim, fontSize: 9.5, marginTop: 2 },
  trendText: { color: C.volt, fontSize: 11.5, marginTop: 4 },
  chart: { flexDirection: "row", height: 90, marginTop: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12 },
  chartCol: { flex: 1, alignItems: "center", marginRight: 4 },
  chartLabel: { color: C.textDim, fontSize: 8.5, marginTop: 4 },
  matchRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  matchVs: { color: C.paper, fontSize: 12.5 },
  matchScore: { fontSize: 12, fontWeight: "700" },

  chatListHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 20 },
  chatListTitle: { color: C.paper, fontSize: 19, fontWeight: "700", marginLeft: 12 },
  convoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderColor: C.line },
  convoName: { color: C.paper, fontSize: 13.5, fontWeight: "600" },
  convoTime: { color: C.textDim, fontSize: 10.5 },
  convoLast: { fontSize: 12, marginTop: 3 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.volt },

  threadHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line },
  threadName: { color: C.paper, fontSize: 14.5, fontWeight: "600", marginLeft: 10 },
  bubble: { maxWidth: "78%", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 16, marginBottom: 10 },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: C.volt, borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: "flex-start", backgroundColor: C.surface, borderBottomLeftRadius: 4 },
  composeRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  messageInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },

  bottomNav: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingVertical: 10, paddingBottom: 22, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.line },
  navLabel: { fontSize: 9.5, fontWeight: "600", marginTop: 3 },
});
