import React, { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { canCancelReservation, useDashboard } from "../context/DashboardContext";
import { useGameRecords } from "../context/GameRecordsContext";
import { confirmAction } from "../utils/confirm";
import { reservationTime } from "../utils/format";
import { Button, C, EmptyCard, ErrorNote, HeaderBar, Icon, R, S, ScreenFrame, styles } from "./shared";
import { useGoTab } from "./HomeScreen";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MatchForm({ initial, saving, onSubmit, onCancel, submitLabel }) {
  const [playedOn, setPlayedOn] = useState(initial?.played_on || todayKey());
  const [opponents, setOpponents] = useState(initial?.opponents || "");
  const [mine, setMine] = useState(initial ? String(initial.player_score) : "");
  const [theirs, setTheirs] = useState(initial ? String(initial.opponent_score) : "");
  const submit = () => onSubmit({ played_on: playedOn, opponents, player_score: mine, opponent_score: theirs });

  return (
    <View style={[styles.profileForm, { marginTop: 0, marginBottom: S.md }]}>
      <Text style={styles.profileFieldLabel}>Opponents</Text>
      <TextInput value={opponents} onChangeText={setOpponents} placeholder="e.g. Ana & Ben" placeholderTextColor={C.textFaint} style={styles.profileInput} maxLength={240} accessibilityLabel="Opponents" />
      <Text style={styles.profileFieldLabel}>Date played</Text>
      <TextInput value={playedOn} onChangeText={setPlayedOn} placeholder="YYYY-MM-DD" placeholderTextColor={C.textFaint} style={styles.profileInput} autoCorrect={false} maxLength={10} accessibilityLabel="Date played, year month day" />
      <View style={{ flexDirection: "row", gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileFieldLabel}>Your score</Text>
          <TextInput value={mine} onChangeText={setMine} keyboardType="number-pad" placeholder="11" placeholderTextColor={C.textFaint} style={[styles.profileInput, { marginTop: S.sm }]} maxLength={2} accessibilityLabel="Your score" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileFieldLabel}>Their score</Text>
          <TextInput value={theirs} onChangeText={setTheirs} keyboardType="number-pad" placeholder="7" placeholderTextColor={C.textFaint} style={[styles.profileInput, { marginTop: S.sm }]} maxLength={2} accessibilityLabel="Opponent score" />
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

function MatchesPanel() {
  const { records, loading, error, saving, createRecord, updateRecord, deleteRecord } = useGameRecords();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const remove = async (game) => {
    if (await confirmAction("Delete match?", `Remove your match against ${game.opponents}? Your stats will update.`)) deleteRecord(game.id);
  };

  return (
    <>
      {adding ? (
        <MatchForm submitLabel="Save match" saving={saving} onCancel={() => setAdding(false)} onSubmit={async (input) => { if (await createRecord(input)) setAdding(false); }} />
      ) : (
        <Button icon="add" label="Record a match" onPress={() => { setEditingId(null); setAdding(true); }} style={{ marginBottom: S.lg }} />
      )}
      {loading ? <ActivityIndicator color={C.volt} /> : null}
      {!loading && !error && !records.length && !adding ? <EmptyCard icon="tennisball-outline" title="No matches recorded yet" message="Record your games to track wins, points and progress." /> : null}
      {records.map((game) => {
        if (editingId === game.id) {
          return <MatchForm key={game.id} initial={game} submitLabel="Update match" saving={saving} onCancel={() => setEditingId(null)} onSubmit={async (input) => { if (await updateRecord(game.id, input)) setEditingId(null); }} />;
        }
        const win = game.result === "win";
        return (
          <View key={game.id} style={styles.matchRow}>
            <View style={[styles.matchResult, { backgroundColor: win ? C.voltSoft : "rgba(255,253,238,0.08)" }]}>
              <Text style={{ color: win ? C.volt : C.textDim, fontWeight: "800", fontSize: 13 }}>{win ? "W" : "L"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchVs} numberOfLines={1}>vs {game.opponents || "Opponent"}</Text>
              <Text style={styles.playerSub}>{new Date(`${game.played_on}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</Text>
            </View>
            <Text style={[styles.matchScore, { color: win ? C.volt : C.textDim, marginRight: S.sm }]}>{game.player_score}–{game.opponent_score}</Text>
            <RowAction icon="create-outline" label={`Edit match against ${game.opponents}`} onPress={() => { setAdding(false); setEditingId(game.id); }} />
            <RowAction icon="trash-outline" label={`Delete match against ${game.opponents}`} onPress={() => remove(game)} />
          </View>
        );
      })}
      <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>
    </>
  );
}

const RESERVATION_STATUS = {
  pending: { label: "Pending", fg: C.butter, bg: "rgba(255,239,179,0.14)" },
  confirmed: { label: "Confirmed", fg: C.volt, bg: C.voltSoft },
  cancelled: { label: "Cancelled", fg: C.textDim, bg: "rgba(255,253,238,0.08)" },
};

function ReservationsPanel() {
  const { reservations, dashboardLoading, cancelReservation, deleteReservation, reload } = useDashboard();
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
    const status = RESERVATION_STATUS[r.status] || RESERVATION_STATUS.pending;
    const cancellable = canCancelReservation(r, now);
    const past = new Date(r.start_time).getTime() < now;
    return (
      <View key={r.id} style={[styles.matchRow, { alignItems: "flex-start" }]}>
        <View style={[styles.infoIcon, { marginTop: 2 }]}><Icon name="calendar" size={16} color={C.volt} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.matchVs} numberOfLines={1}>{r.court?.name || "Court no longer listed"}</Text>
          <Text style={styles.playerSub}>{reservationTime(r)}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: S.sm, gap: S.sm }}>
            <View style={[historyStyles.status, { backgroundColor: status.bg }]}><Text style={[historyStyles.statusText, { color: status.fg }]}>{past && r.status !== "cancelled" ? "Past" : status.label}</Text></View>
          </View>
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
  const { records, loading: gamesLoading } = useGameRecords();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await reloadDashboard();
    // GameRecords doesn't expose a reload, but the dashboard reload covers
    // reservations; matches are local so a brief visual refresh is enough.
    setTimeout(() => setRefreshing(false), 600);
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
        <HeaderBar showBack title="History" />
        <View style={historyStyles.segment}>
          {[["matches", "Matches"], ["reservations", "Reservations"]].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[historyStyles.segmentBtn, tab === key && historyStyles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
              <Text style={[historyStyles.segmentText, tab === key && { color: C.ink }]}>{label}</Text>
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
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: R.sm, alignItems: "center" },
  segmentActive: { backgroundColor: C.volt },
  segmentText: { color: C.mist, fontSize: 14, fontWeight: "700" },
  rowAction: { padding: 6, marginLeft: 2 },
  status: { borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 11.5, fontWeight: "700" },
});
