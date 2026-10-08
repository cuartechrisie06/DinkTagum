import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { buildDayOptions, slotHasStarted, useDashboard } from "../context/DashboardContext";
import { BOOKING_SLOTS } from "../utils/courts";
import { GameSuggestions } from "./Suggestions";
import { OPEN_PLAY_FORMATS, SKILL_RANGES, skillLabel, useOpenPlay } from "../context/OpenPlayContext";
import { confirmAction, notify } from "../utils/confirm";
import { gameTimeLabel, initialsFor } from "../utils/format";
import { Avatar, Button, C, ErrorNote, Icon, R, S, SectionTitle, styles } from "./shared";

// Open play can start any hour the courts are typically lit.
const START_TIMES = Array.from({ length: 16 }, (_, i) => {
  const hour = 6 + i;
  return `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;
});

function Chip({ label, active, onPress, accessibilityLabel }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, { paddingVertical: 7 }, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={accessibilityLabel || label}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// One roster slot per spot: joined players as avatars, open spots dashed.
function RosterSlots({ game }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: game.capacity }, (_, i) => {
        const player = game.players[i];
        return (
          <View key={player?.id || `open-${i}`} style={{ marginLeft: i ? -8 : 0 }}>
            {player ? (
              <View style={openStyles.slotRing}><Avatar initials={initialsFor(player.name)} uri={player.avatar_url} size={30} /></View>
            ) : (
              <View style={openStyles.openSlot}><Icon name="add" size={14} color={C.textFaint} /></View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function OpenGameCard({ game, onOpenCourt, showCourt = true }) {
  const { busyId, joinGame, leaveGame, cancelGame } = useOpenPlay();
  const busy = busyId === game.id;
  const names = game.players.map((p) => (p.name || "Player").split(" ")[0]).join(", ");

  const cancel = async () => {
    if (await confirmAction("Cancel this game?", "Everyone who joined will be notified.", "Cancel game")) cancelGame(game.id);
  };
  const leave = async () => {
    if (await confirmAction("Leave this game?", `${game.host_name || "The host"} will be notified and your spot will open up.`, "Leave")) leaveGame(game.id);
  };

  let action;
  if (game.isHost) action = <Button variant="ghost" icon="close-circle-outline" label="Cancel game" onPress={cancel} disabled={busy} style={{ flex: 1 }} accessibilityLabel={`Cancel your game at ${game.court_name}`} />;
  else if (game.isJoined) action = <Button variant="ghost" icon="exit-outline" label="Leave" onPress={leave} disabled={busy} style={{ flex: 1 }} accessibilityLabel={`Leave game at ${game.court_name}`} />;
  else if (game.isFull) action = <Button variant="ghost" label="Game is full" disabled style={{ flex: 1 }} />;
  else action = <Button icon="enter-outline" label={`Join · ${game.spotsLeft} spot${game.spotsLeft === 1 ? "" : "s"} left`} onPress={() => joinGame(game.id)} loading={busy} style={{ flex: 1, minHeight: 42 }} accessibilityLabel={`Join game at ${game.court_name}`} />;

  return (
    <View style={[openStyles.card, (game.isJoined || game.isHost) && openStyles.cardMine]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={openStyles.tag}><Text style={openStyles.tagText}>{game.format}</Text></View>
          <View style={[openStyles.tag, { backgroundColor: C.surface2 }]}><Text style={[openStyles.tagText, { color: C.mist }]}>{skillLabel(game)}</Text></View>
        </View>
        {game.isHost ? <Text style={openStyles.roleText}>HOSTING</Text> : game.isJoined ? <Text style={openStyles.roleText}>YOU&apos;RE IN</Text> : null}
      </View>

      <Text style={openStyles.time}>{gameTimeLabel(game.starts_at)}</Text>
      {showCourt ? (
        <TouchableOpacity onPress={onOpenCourt} disabled={!onOpenCourt} style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }} accessibilityRole="button" accessibilityLabel={`Open ${game.court_name}`}>
          <Icon name="location-outline" size={13} color={C.textDim} />
          <Text style={[styles.playerSub, { marginTop: 0, marginLeft: 3, flexShrink: 1 }]} numberOfLines={1}>{game.court_name}{game.court_area ? ` · ${game.court_area}` : ""}</Text>
        </TouchableOpacity>
      ) : null}
      {game.note ? <Text style={openStyles.note} numberOfLines={3}>“{game.note}”</Text> : null}

      <View style={openStyles.rosterRow}>
        <RosterSlots game={game} />
        <Text style={openStyles.rosterText} numberOfLines={1}>{game.players.length}/{game.capacity} · {names}</Text>
      </View>

      <View style={{ flexDirection: "row", marginTop: S.md }}>{action}</View>
    </View>
  );
}

// Whether "Host + book" can reserve this start time: the court takes bookings
// and the time is one of its bookable one-hour slots.
export function canBookWithHost(court, timeLabel) {
  return court?.status === "Available" && BOOKING_SLOTS.includes(timeLabel);
}

export function HostGameForm({ court, onDone, onBooked }) {
  const { hostGame, busyId } = useOpenPlay();
  const { createReservation } = useDashboard();
  const [booking, setBooking] = useState(false);
  const days = useMemo(() => buildDayOptions(5), []);
  const [dayKey, setDayKey] = useState(days[0].key);
  const day = days.find((d) => d.key === dayKey) || days[0];
  const [now] = useState(() => Date.now());
  const times = START_TIMES.filter((t) => !slotHasStarted(day.date, t, now));
  const [time, setTime] = useState("4:00 PM");
  const [format, setFormat] = useState("Doubles");
  const [skillKey, setSkillKey] = useState("any");
  const [note, setNote] = useState("");
  const chosenTime = times.includes(time) ? time : times[0];

  const bookable = canBookWithHost(court, chosenTime);
  const post = () => hostGame({ courtId: court.id, dayKey, timeLabel: chosenTime, format, skillKey, note });

  const submit = async () => {
    if (await post()) onDone?.();
  };

  // Book first: if the slot is already taken, nothing gets posted. If the
  // booking works but posting fails, the booking stays and the player is told.
  const hostAndBook = async () => {
    setBooking(true);
    const result = await createReservation(court, dayKey, chosenTime, 1);
    if (!result.ok) {
      setBooking(false);
      notify("Couldn't book this slot", `${result.message || "Try another time."} Your game wasn't posted.`, "error");
      return;
    }
    onBooked?.(dayKey);
    const posted = await post();
    setBooking(false);
    if (posted) {
      notify("Game posted and slot requested", "The venue confirms bookings; we'll notify you when it's confirmed.", "success");
      onDone?.();
    } else {
      notify("Slot requested, game not posted", "Your booking went through. Try posting the game again.", "error");
    }
  };

  return (
    <View style={[styles.profileForm, { marginTop: S.md }]}>
      <Text style={styles.profileFieldLabel}>Day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {days.map((d) => <Chip key={d.key} label={d.label} active={dayKey === d.key} onPress={() => setDayKey(d.key)} />)}
      </ScrollView>
      <Text style={styles.profileFieldLabel}>Start time</Text>
      {times.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {times.map((t) => <Chip key={t} label={t} active={chosenTime === t} onPress={() => setTime(t)} />)}
        </ScrollView>
      ) : <Text style={styles.profileHint}>No start times left today — pick another day.</Text>}
      <Text style={styles.profileFieldLabel}>Format</Text>
      <View style={styles.choiceRow}>
        {OPEN_PLAY_FORMATS.map((f) => <Chip key={f} label={`${f} · ${f === "Singles" ? 2 : 4}`} active={format === f} onPress={() => setFormat(f)} accessibilityLabel={f} />)}
      </View>
      <Text style={styles.profileFieldLabel}>Skill level</Text>
      <View style={styles.choiceRow}>
        {SKILL_RANGES.map((r) => <Chip key={r.key} label={r.label} active={skillKey === r.key} onPress={() => setSkillKey(r.key)} />)}
      </View>
      <Text style={styles.profileFieldLabel}>Note (optional)</Text>
      <TextInput value={note} onChangeText={setNote} maxLength={280} multiline placeholder="e.g. Friendly rally, bring a ball" placeholderTextColor={C.textFaint} style={[styles.profileInput, { minHeight: 64, textAlignVertical: "top" }]} accessibilityLabel="Game note" />
      <View style={openStyles.callout} accessibilityRole="text">
        <Icon name="information-circle" size={18} color={C.butter} />
        <View style={{ flex: 1 }}>
          <Text style={openStyles.calloutTitle}>Hosting doesn&apos;t reserve the court</Text>
          <Text style={styles.profileHint}>
            {bookable
              ? "Players can join your game, but the court can still be booked by others. Use “Host + book” to request this slot too."
              : court?.status !== "Available"
                ? "This court isn't taking bookings right now, so check with the venue before you play."
                : `${chosenTime || "This time"} isn't one of this court's bookable slots. Pick a listed slot to book it with your game.`}
          </Text>
        </View>
      </View>
      {bookable ? (
        <Button icon="calendar" label={`Host + book ${chosenTime}`} onPress={hostAndBook} loading={booking} disabled={!times.length || busyId === "new"} style={{ marginTop: S.xs, minHeight: 48 }} accessibilityLabel={`Post game and book ${chosenTime} on ${day.label}`} />
      ) : null}
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.xs }}>
        <Button variant="ghost" label="Cancel" onPress={onDone} disabled={booking} style={{ flex: 1 }} />
        <Button variant={bookable ? "secondary" : "primary"} icon="megaphone-outline" label={bookable ? "Host only" : "Post game"} onPress={submit} loading={busyId === "new" && !booking} disabled={!times.length || booking} style={{ flex: 2, minHeight: 44 }} />
      </View>
    </View>
  );
}

// Home screen: upcoming open games across every court.
export function OpenPlaySection({ courts, openCourt, onFindCourt, suggestCourtsWhenEmpty = true }) {
  const { games, loading, error, available } = useOpenPlay();
  const courtById = useMemo(() => Object.fromEntries(courts.map((c) => [c.id, c])), [courts]);
  // Games the viewer is in come first, then the rest by start time.
  const shown = useMemo(() => [...games].sort((a, b) => Number(b.isJoined || b.isHost) - Number(a.isJoined || a.isHost)).slice(0, 4), [games]);
  if (!available) return null;

  return (
    <View style={{ marginTop: S.xxl }}>
      <View style={{ paddingHorizontal: S.xl }}>
        <SectionTitle action={games.length ? "Host a game" : null} onAction={onFindCourt}>Open play</SectionTitle>
        <Text style={styles.mapDescription}>Pickup games looking for players.</Text>
      </View>
      {loading ? <ActivityIndicator color={C.volt} style={{ marginTop: S.lg }} /> : shown.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }} contentContainerStyle={{ paddingLeft: S.xl, paddingRight: S.sm }}>
          {shown.map((game) => (
            <View key={game.id} style={{ width: 280, marginRight: S.md }}>
              <OpenGameCard game={game} onOpenCourt={courtById[game.court_id] ? () => openCourt(courtById[game.court_id]) : undefined} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={{ paddingHorizontal: S.xl, marginTop: S.md }}>
          <GameSuggestions
            courts={courts}
            onOpenCourt={openCourt}
            onHost={(court) => (court ? openCourt(court) : onFindCourt())}
            hostLabel="Host a game"
            intro="No open games yet. Host one at a court with a free slot, and players nearby can join until it's full."
          />
        </View>
      )}
      <ErrorNote>{error}</ErrorNote>
    </View>
  );
}

// Court detail: games at this court plus the host form.
export function CourtOpenPlay({ court, onBooked }) {
  const { games, loading, available } = useOpenPlay();
  const [hosting, setHosting] = useState(false);
  const here = games.filter((g) => g.court_id === court.id);
  const closed = court.status === "Closed";
  if (!available) return null;

  return (
    <View style={{ marginTop: S.xxl }}>
      <SectionTitle action={!hosting && !closed ? "Host here" : null} onAction={() => setHosting(true)}>Open play here</SectionTitle>
      {hosting ? <HostGameForm court={court} onDone={() => setHosting(false)} onBooked={onBooked} /> : null}
      {loading ? <ActivityIndicator color={C.volt} style={{ marginTop: S.md }} /> : here.length ? (
        <View style={{ marginTop: S.md, gap: S.sm }}>
          {here.map((game) => <OpenGameCard key={game.id} game={game} showCourt={false} />)}
        </View>
      ) : !hosting ? (
        <Text style={[styles.mapDescription, { marginTop: S.sm }]}>{closed ? "This court is closed, so open play is paused." : "No open games here yet. Host one and others can join."}</Text>
      ) : null}
    </View>
  );
}

const openStyles = StyleSheet.create({
  callout: { flexDirection: "row", alignItems: "flex-start", gap: S.sm, padding: S.md, borderRadius: R.md, backgroundColor: "rgba(255,239,179,0.08)", borderWidth: 1, borderColor: "rgba(255,239,179,0.35)" },
  calloutTitle: { color: C.paper, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg },
  cardMine: { borderColor: "rgba(227,239,38,0.4)" },
  tag: { backgroundColor: C.voltSoft, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { color: C.volt, fontSize: 11.5, fontWeight: "800" },
  roleText: { color: C.volt, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8 },
  time: { color: C.paper, fontSize: 17, fontWeight: "800", marginTop: S.md, letterSpacing: -0.2 },
  note: { color: C.mist, fontSize: 13.5, lineHeight: 19, marginTop: S.sm, fontStyle: "italic" },
  rosterRow: { flexDirection: "row", alignItems: "center", marginTop: S.md, gap: S.sm },
  rosterText: { color: C.textDim, fontSize: 12.5, flex: 1 },
  slotRing: { borderRadius: 17, borderWidth: 2, borderColor: C.surface },
  openSlot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderStyle: "dashed", borderColor: C.lineStrong, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
});
