import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { canCancelReservation, useDashboard } from "../context/DashboardContext";
import { canEditRecord, confirmationBadge, gameRecordFieldErrors, useGameRecords } from "../context/GameRecordsContext";
import { chooseAction, confirmAction, notify } from "../utils/confirm";
import { composePostBody } from "../utils/community";
import { useCommunityFeedOptional } from "../context/CommunityFeedContext";
import { addBookingToCalendar } from "../utils/bookingActions";
import { calendarBookingFor, canAddToCalendar, reservationBadgeKey } from "../utils/reservations";
import { RESERVATION_STATUS } from "./reservationStatus";
import { initialsFor, reservationTime } from "../utils/format";
import { Avatar, Button, C, EmptyCard, ErrorNote, FieldError, HeaderBar, Icon, R, S, ScreenFrame, styles } from "./shared";
import { useGoTab } from "./HomeScreen";

function dateKey(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatPlayedOn(playedOn) {
  return new Date(`${playedOn}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// Searches the player directory so a match can be tagged with a registered
// opponent, who is then asked to confirm the score.
function OpponentPicker({ selected, onSelect }) {
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const term = query.trim();

  useEffect(() => {
    if (!supabase || term.length < 2) return undefined;
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from("profiles").select("id, display_name, avatar_url, skill_level").ilike("display_name", `%${term.replace(/[%_]/g, "")}%`).neq("id", session.user.id).limit(5);
      if (!active) return;
      setResults(data || []);
      setSearching(false);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [term, session.user.id]);

  if (selected) {
    return (
      <View style={historyStyles.taggedRow}>
        <Avatar initials={initialsFor(selected.name)} uri={selected.avatarUrl} size={30} />
        <View style={{ flex: 1, marginLeft: S.sm }}>
          <Text style={historyStyles.taggedName} numberOfLines={1}>{selected.name}</Text>
          <Text style={[styles.profileHint, { marginTop: 1 }]}>They&apos;ll be asked to confirm the score.</Text>
        </View>
        <TouchableOpacity onPress={() => onSelect(null)} accessibilityRole="button" accessibilityLabel="Remove tagged opponent" hitSlop={8} style={{ padding: 4 }}>
          <Icon name="close-circle" size={20} color={C.textDim} />
        </TouchableOpacity>
      </View>
    );
  }

  const shown = term.length >= 2 ? results : [];
  return (
    <View>
      <View style={[styles.searchField, { backgroundColor: C.ink }]}>
        <Icon name="search" size={16} color={C.textDim} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search players (optional)" placeholderTextColor={C.textFaint} style={[styles.searchInput, { paddingVertical: 10, fontSize: 14 }]} autoCorrect={false} accessibilityLabel="Search for a registered opponent" />
        {searching ? <ActivityIndicator size="small" color={C.volt} /> : null}
      </View>
      {shown.map((player) => (
        <TouchableOpacity
          key={player.id}
          onPress={() => { onSelect({ id: player.id, name: player.display_name, avatarUrl: player.avatar_url }); setQuery(""); }}
          style={historyStyles.resultRow}
          accessibilityRole="button"
          accessibilityLabel={`Tag ${player.display_name}`}
        >
          <Avatar initials={initialsFor(player.display_name)} uri={player.avatar_url} size={28} />
          <Text style={[historyStyles.taggedName, { flex: 1, marginLeft: S.sm }]} numberOfLines={1}>{player.display_name}</Text>
          <Text style={[styles.profileHint, { marginTop: 0 }]}>{player.skill_level || "3.0"}</Text>
        </TouchableOpacity>
      ))}
      {!searching && term.length >= 2 && !shown.length ? <Text style={styles.profileHint}>No players match “{term}”.</Text> : null}
    </View>
  );
}

function MatchForm({ initial, saving, onSubmit, onCancel, submitLabel, allowTagging }) {
  const [playedOn, setPlayedOn] = useState(initial?.played_on || dateKey());
  const [opponents, setOpponents] = useState(initial?.opponents || "");
  const [mine, setMine] = useState(initial ? String(initial.player_score) : "");
  const [theirs, setTheirs] = useState(initial ? String(initial.opponent_score) : "");
  const [tagged, setTagged] = useState(initial?.opponent_id ? { id: initial.opponent_id, name: initial.opponents } : null);
  const input = { played_on: playedOn, opponents, player_score: mine, opponent_score: theirs, opponent_id: tagged?.id || null };
  // Errors show after the first save attempt, then update as the player types.
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? gameRecordFieldErrors(input) : {};
  const submit = () => {
    if (Object.keys(gameRecordFieldErrors(input)).length) { setShowErrors(true); return; }
    onSubmit(input);
  };
  const tag = (player) => {
    setTagged(player);
    if (player && !opponents.trim()) setOpponents(player.name);
  };
  const quickDates = [["Today", dateKey(0)], ["Yesterday", dateKey(1)]];

  return (
    <View style={[styles.profileForm, { marginTop: 0, marginBottom: S.md }]}>
      <Text style={styles.profileFieldLabel}>Opponents</Text>
      <TextInput value={opponents} onChangeText={setOpponents} placeholder="e.g. Ana & Ben" placeholderTextColor={C.textFaint} style={[styles.profileInput, errors.opponents && styles.inputError]} maxLength={240} accessibilityLabel="Opponents" accessibilityHint={errors.opponents} />
      <FieldError message={errors.opponents} />
      {allowTagging ? (
        <>
          <Text style={styles.profileFieldLabel}>Tag a registered opponent</Text>
          <OpponentPicker selected={tagged} onSelect={tag} />
        </>
      ) : null}
      <Text style={styles.profileFieldLabel}>Date played</Text>
      <View style={{ flexDirection: "row", gap: S.sm }}>
        {quickDates.map(([label, key]) => (
          <TouchableOpacity key={label} onPress={() => setPlayedOn(key)} style={[styles.chip, { marginRight: 0, paddingVertical: 6 }, playedOn === key && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: playedOn === key }}>
            <Text style={[styles.chipText, playedOn === key && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput value={playedOn} onChangeText={setPlayedOn} placeholder="YYYY-MM-DD" placeholderTextColor={C.textFaint} style={[styles.profileInput, errors.played_on && styles.inputError]} autoCorrect={false} maxLength={10} accessibilityLabel="Date played, year month day" accessibilityHint={errors.played_on} />
      <FieldError message={errors.played_on} />
      <View style={{ flexDirection: "row", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileFieldLabel}>Your score</Text>
          <TextInput value={mine} onChangeText={setMine} keyboardType="number-pad" placeholder="11" placeholderTextColor={C.textFaint} style={[styles.profileInput, { marginTop: S.sm }, errors.player_score && styles.inputError]} maxLength={2} accessibilityLabel="Your score" accessibilityHint={errors.player_score} />
          <FieldError message={errors.player_score} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileFieldLabel}>Their score</Text>
          <TextInput value={theirs} onChangeText={setTheirs} keyboardType="number-pad" placeholder="7" placeholderTextColor={C.textFaint} style={[styles.profileInput, { marginTop: S.sm }, errors.opponent_score && styles.inputError]} maxLength={2} accessibilityLabel="Opponent score" accessibilityHint={errors.opponent_score} />
          <FieldError message={errors.opponent_score} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.xs }}>
        <Button variant="ghost" label="Cancel" onPress={onCancel} disabled={saving} style={{ flex: 1 }} />
        <Button label={submitLabel} icon="checkmark" onPress={submit} loading={saving} style={{ flex: 2, minHeight: 44 }} />
      </View>
    </View>
  );
}

function RowAction({ icon, label, onPress, disabled }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={historyStyles.rowAction} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Icon name={icon} size={18} color={disabled ? C.textFaint : C.textDim} />
    </TouchableOpacity>
  );
}

// Matches other players recorded against us, waiting for a yes/no.
function PendingConfirmations() {
  const { pending, respondingId, respondToMatch } = useGameRecords();
  if (!pending.length) return null;

  const dispute = async (row) => {
    if (await confirmAction("Dispute this score?", `${row.reporter_name || "The reporter"} will be asked to correct it and send it again.`, "Dispute")) respondToMatch(row.record_id, false);
  };

  return (
    <View style={{ marginBottom: S.lg }}>
      <Text style={historyStyles.panelLabel}>{pending.length === 1 ? "CONFIRM THIS SCORE" : `CONFIRM ${pending.length} SCORES`}</Text>
      {pending.map((row) => {
        const won = row.my_score > row.reporter_score;
        const busy = respondingId === row.record_id;
        const name = row.reporter_name || "DinkTagum player";
        return (
          <View key={row.record_id} style={historyStyles.pendingCard}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Avatar initials={initialsFor(name)} uri={row.reporter_avatar_url} size={36} />
              <View style={{ flex: 1, marginLeft: S.md }}>
                <Text style={styles.matchVs} numberOfLines={1}>vs {name}</Text>
                <Text style={styles.playerSub}>{formatPlayedOn(row.played_on)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.matchScore, { color: won ? C.volt : C.paper }]}>{row.my_score}–{row.reporter_score}</Text>
                <Text style={[styles.profileHint, { marginTop: 0 }]}>{won ? "You won" : "You lost"}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
              <Button variant="ghost" icon="close" label="Dispute" onPress={() => dispute(row)} disabled={busy} style={{ flex: 1 }} accessibilityLabel={`Dispute match with ${name}`} />
              <Button icon="checkmark" label="Confirm" onPress={() => respondToMatch(row.record_id, true)} loading={busy} style={{ flex: 1, minHeight: 40 }} accessibilityLabel={`Confirm match with ${name}`} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ConfirmationTag({ game }) {
  const badge = confirmationBadge(game);
  if (!badge) return null;
  const color = badge.tone === "volt" ? C.volt : C.butter;
  return (
    <View style={historyStyles.confirmTag}>
      <Icon name={badge.icon} size={12} color={color} />
      <Text style={[historyStyles.confirmTagText, { color }]}>{badge.label}</Text>
    </View>
  );
}

function MatchesPanel() {
  const { records, loading, error, saving, createRecord, updateRecord, deleteRecord, confirmationSupported } = useGameRecords();
  const feed = useCommunityFeedOptional();

  // After logging a match, offer to post the result to the community feed.
  const offerShare = (saved) => {
    if (!feed || typeof saved !== "object") return;
    chooseAction("Match saved", "Share the result with the community?", [
      {
        label: "Share to feed",
        icon: "megaphone-outline",
        onPress: async () => {
          const result = await feed.createCommunityPost({
            type: feed.postTypesSupported ? "match" : "text",
            body: composePostBody({ type: "match", match: saved }),
            matchRecordId: saved.id,
          });
          notify(result.ok ? "Shared to the feed" : "Couldn't share the match", result.ok ? "Your result is on the community feed." : result.error, result.ok ? "success" : "error");
        },
      },
      { label: "Not now", icon: "close" },
    ]);
  };
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const remove = async (game) => {
    if (await confirmAction("Delete match?", `Remove your match against ${game.opponents}? Your stats will update.`)) deleteRecord(game.id);
  };

  return (
    <>
      <PendingConfirmations />
      {adding ? (
        <MatchForm allowTagging={confirmationSupported} submitLabel="Save match" saving={saving} onCancel={() => setAdding(false)} onSubmit={async (input) => { const saved = await createRecord(input); if (saved) { setAdding(false); offerShare(saved); } }} />
      ) : (
        <Button icon="add" label="Record a match" onPress={() => { setEditingId(null); setAdding(true); }} style={{ marginBottom: S.lg }} />
      )}
      {loading ? <ActivityIndicator color={C.volt} /> : null}
      {!loading && !error && !records.length && !adding ? <EmptyCard icon="tennisball-outline" title="No matches recorded yet" message="Record your games to track wins, points and progress. Tag a registered opponent to get the score verified." /> : null}
      {records.map((game) => {
        if (editingId === game.id) {
          // Mirrored records (added when we confirmed someone else's score)
          // already point at the reporter, so they can't be re-tagged.
          return <MatchForm key={game.id} allowTagging={confirmationSupported && !game.source_record_id} initial={game} submitLabel="Update match" saving={saving} onCancel={() => setEditingId(null)} onSubmit={async (input) => { if (await updateRecord(game.id, input)) setEditingId(null); }} />;
        }
        const win = game.result === "win";
        return (
          <View key={game.id} style={styles.matchRow}>
            <View style={[styles.matchResult, { backgroundColor: win ? C.voltSoft : "rgba(255,253,238,0.08)" }]}>
              <Text style={{ color: win ? C.volt : C.textDim, fontWeight: "800", fontSize: 13 }}>{win ? "W" : "L"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchVs} numberOfLines={1}>vs {game.opponents || "Opponent"}</Text>
              <Text style={styles.playerSub}>{formatPlayedOn(game.played_on)}</Text>
              <ConfirmationTag game={game} />
            </View>
            <Text style={[styles.matchScore, { color: win ? C.volt : C.textDim, marginRight: S.sm }]}>{game.player_score}–{game.opponent_score}</Text>
            {canEditRecord(game) ? <RowAction icon="create-outline" label={`Edit match against ${game.opponents}`} onPress={() => { setAdding(false); setEditingId(game.id); }} /> : null}
            <RowAction icon="trash-outline" label={`Delete match against ${game.opponents}`} onPress={() => remove(game)} />
          </View>
        );
      })}
      <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>
    </>
  );
}

function ReservationsPanel() {
  const { reservations, dashboardLoading, cancelReservation, deleteReservation } = useDashboard();
  const goTab = useGoTab();
  const [busyId, setBusyId] = useState("");
  // Captured once per visit so the list renders deterministically.
  const [now] = useState(() => Date.now());

  const run = async (id, action) => { setBusyId(id); await action(id); setBusyId(""); };
  const cancel = async (r) => {
    if (await confirmAction("Cancel reservation?", `Cancel ${r.court?.name || "this court"} on ${reservationTime(r)}? The slot will open up for other players.`, "Cancel reservation")) run(r.id, cancelReservation);
  };
  const remove = async (r) => {
    if (await confirmAction("Remove from history?", "This permanently deletes the reservation record.", "Remove")) run(r.id, deleteReservation);
  };

  if (dashboardLoading) return <ActivityIndicator color={C.volt} />;
  if (!reservations.length) return (
    <EmptyCard icon="calendar-outline" title="No reservations yet" message="Book a slot from any court page and it will show up here.">
      <Button
        label="Find a court"
        icon="tennisball-outline"
        onPress={() => goTab("courts")}
        style={{ marginTop: S.lg, minHeight: 44 }}
        accessibilityLabel="Go to the courts screen to book a slot"
      />
    </EmptyCard>
  );

  return reservations.map((r) => {
    const status = RESERVATION_STATUS[reservationBadgeKey(r, now)];
    const cancellable = canCancelReservation(r, now);
    return (
      <View key={r.id} style={[styles.matchRow, { alignItems: "flex-start" }]}>
        <View style={[styles.infoIcon, { marginTop: 2 }]}><Icon name="calendar" size={16} color={C.volt} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.matchVs} numberOfLines={1}>{r.court?.name || "Court no longer listed"}</Text>
          <Text style={styles.playerSub}>{reservationTime(r)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: S.sm, gap: S.sm }}>
            <View style={[historyStyles.status, { backgroundColor: status.bg }]}><Text style={[historyStyles.statusText, { color: status.fg }]}>{status.short}</Text></View>
            {canAddToCalendar(r, now) ? (
              <TouchableOpacity onPress={() => addBookingToCalendar(calendarBookingFor(r, r.court))} style={historyStyles.calendarLink} accessibilityRole="button" accessibilityLabel={`Add ${r.court?.name || "this booking"} to your calendar`} hitSlop={6}>
                <Icon name="calendar-outline" size={14} color={C.volt} />
                <Text style={historyStyles.calendarLinkText}>Add to calendar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {r.status === "declined" ? <Text style={[styles.profileHint, { marginTop: 4 }]}>The venue couldn&apos;t take this booking. Try another time.</Text> : null}
        </View>
        {cancellable ? (
          <Button variant="ghost" label={busyId === r.id ? "…" : "Cancel"} onPress={() => cancel(r)} disabled={busyId === r.id} style={{ minHeight: 34, paddingHorizontal: S.md }} accessibilityLabel={`Cancel reservation at ${r.court?.name || "court"}`} />
        ) : (
          <RowAction icon="trash-outline" label="Remove reservation from history" onPress={() => remove(r)} disabled={busyId === r.id} />
        )}
      </View>
    );
  });
}

export function HistoryScreen() {
  const [tab, setTab] = useState("matches");
  const { reload: reloadDashboard } = useDashboard();
  const { reload: reloadRecords, pending } = useGameRecords();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    reloadDashboard();
    await reloadRecords();
    setRefreshing(false);
  };

  return (
    <ScreenFrame>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={C.volt}
            colors={[C.volt]}
            progressBackgroundColor={C.surface}
          />
        }
      >
        <HeaderBar showBack title="Matches & bookings" />
        <View style={historyStyles.segment}>
          {[["matches", "Matches"], ["reservations", "Reservations"]].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[historyStyles.segmentBtn, tab === key && historyStyles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
              <Text style={[historyStyles.segmentText, tab === key && { color: C.ink }]}>{label}</Text>
              {key === "matches" && pending.length ? <View style={historyStyles.segmentBadge}><Text style={historyStyles.segmentBadgeText}>{pending.length}</Text></View> : null}
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ paddingHorizontal: S.xl, marginTop: S.lg }}>
          {tab === "matches" ? <MatchesPanel /> : <ReservationsPanel />}
        </View>
      </ScrollView>
    </ScreenFrame>
  );
}

const historyStyles = StyleSheet.create({
  segment: { flexDirection: "row", marginHorizontal: S.xl, marginTop: S.lg, backgroundColor: C.surface, borderRadius: R.md, padding: 4, borderWidth: 1, borderColor: C.line },
  segmentBtn: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 10, borderRadius: R.sm },
  segmentActive: { backgroundColor: C.volt },
  segmentText: { color: C.mist, fontSize: 14, fontWeight: "700" },
  segmentBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.butter, alignItems: "center", justifyContent: "center", marginLeft: 6, paddingHorizontal: 5 },
  segmentBadgeText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  rowAction: { padding: 6, marginLeft: 2 },
  status: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 11.5, fontWeight: "700" },
  calendarLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  calendarLinkText: { color: C.volt, fontSize: 12.5, fontWeight: "700" },
  panelLabel: { color: C.butter, fontSize: 11.5, fontWeight: "800", letterSpacing: 1, marginBottom: S.sm },
  pendingCard: { backgroundColor: C.surface2, borderWidth: 1, borderColor: "rgba(255,239,179,0.35)", borderRadius: R.lg, padding: S.lg, marginBottom: S.sm },
  confirmTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  confirmTagText: { fontSize: 11.5, fontWeight: "700" },
  taggedRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.ink, borderWidth: 1, borderColor: C.volt, borderRadius: R.sm + 2, padding: S.sm },
  taggedName: { color: C.paper, fontSize: 14, fontWeight: "700" },
  resultRow: { flexDirection: "row", alignItems: "center", paddingVertical: S.sm, paddingHorizontal: S.xs, borderBottomWidth: 1, borderColor: C.line },
});
