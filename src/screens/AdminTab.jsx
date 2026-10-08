import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useDashboard } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { confirmAction, notify } from "../utils/confirm";
import { reservationTime } from "../utils/format";
import { adminActionsFor } from "../utils/reservations";
import { Button, C, EmptyCard, ErrorNote, OverlayHeader, S, SectionTitle, styles } from "./shared";
import { COURT_COLUMNS, courtFormToRow, courtToForm, emptyCourt } from "./admin/courtRules";
import { CourtForm } from "./admin/CourtForm";
import { AdminRow, CourtAdminRow } from "./admin/CourtAdminRow";

// Admin overlay: court CRUD, reservation confirmation, post moderation and
// directory visibility. The court form and rows live in ./admin/.

export { courtFormToRow };

const small = { minHeight: 34, paddingHorizontal: S.md };

export function AdminTab({ user, onBack }) {
  const { reload: reloadDashboard } = useDashboard();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [authorized, setAuthorized] = useState(null);
  const [counts, setCounts] = useState(null);
  const [reportedPosts, setReportedPosts] = useState([]);
  const [courts, setCourts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [savingId, setSavingId] = useState("");
  // null = list view, "new" = add form, string uuid = edit form
  const [courtEditor, setCourtEditor] = useState(null);
  const [error, setError] = useState("");

  const namesById = Object.fromEntries(
    profiles.map((p) => [p.id, p.display_name || "Unnamed player"]),
  );

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const isAdmin =
      !authError &&
      authData.user?.id === user?.id &&
      authData.user?.app_metadata?.role === "admin";
    setAuthorized(isAdmin);
    if (!isAdmin) return;

    const [
      reservationCount,
      reportCount,
      postRows,
      courtRows,
      profileRows,
      reservationRows,
    ] = await Promise.all([
      supabase
        .from("reservations")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("is_reported", true),
      supabase
        .from("community_posts")
        .select("id, body, author_id, created_at")
        .eq("is_reported", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("courts")
        .select(COURT_COLUMNS)
        .order("name", { ascending: true })
        .limit(200),
      supabase
        .from("profiles")
        .select("id, display_name, is_directory_visible")
        .order("display_name", { ascending: true })
        .limit(200),
      supabase
        .from("reservations")
        .select(
          "id, user_id, court_id, start_time, end_time, status, courts(name)",
        )
        .in("status", ["pending", "confirmed"])
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(100),
    ]);

    const queryError = [
      reservationCount.error,
      reportCount.error,
      postRows.error,
      courtRows.error,
      profileRows.error,
      reservationRows.error,
    ].find(Boolean);

    if (queryError) {
      setError(`Admin data could not be loaded: ${queryError.message}`);
      return;
    }
    setError("");
    setCounts({
      reservations: reservationCount.count || 0,
      reports: reportCount.count || 0,
    });
    setReportedPosts(postRows.data || []);
    setCourts(courtRows.data || []);
    setProfiles(profileRows.data || []);
    setReservations(reservationRows.data || []);
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Generic mutation wrapper
  const mutate = async (id, request, onSuccess, failTitle = "Could not save change") => {
    setSavingId(id);
    const { data, error: reqError } = await request;
    setSavingId("");
    if (reqError) {
      const inUse = reqError.code === "23503" || /foreign key/i.test(reqError.message);
      // "declined" needs the reservation status migration.
      const statusUnsupported = /reservations_status_check/i.test(reqError.message);
      notify(
        failTitle,
        inUse
          ? "This court still has reservations. Close it instead, or remove its reservations first."
          : statusUnsupported
            ? "Declining needs the latest database migration (20261009000000_reservation_status_flow). Cancel the booking instead for now."
            : reqError.message,
      );
      return false;
    }
    onSuccess(data);
    return true;
  };

  // ── Courts CRUD ──────────────────────────────────────────────────────────────

  // Rows come back with "*", so the new columns are present exactly when the
  // court details migration has been applied.
  const courtDetailsSupported = courts.length === 0 || courts.some((court) => "surface" in court);

  const saveCourt = async (form) => {
    const { value, error: invalid } = courtFormToRow(form, { details: courtDetailsSupported });
    if (invalid) { notify("Check the court details", invalid); return; }

    const isNew = courtEditor === "new";
    const request = isNew
      ? supabase.from("courts").insert(value).select(COURT_COLUMNS).single()
      : supabase
          .from("courts")
          .update(value)
          .eq("id", courtEditor)
          .select(COURT_COLUMNS)
          .single();

    const ok = await mutate(
      courtEditor,
      request,
      (row) => {
        setCourts((items) =>
          (isNew
            ? [...items, row]
            : items.map((item) => (item.id === row.id ? row : item))
          ).sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      isNew ? "Could not add court" : "Could not update court",
    );

    if (ok) {
      setCourtEditor(null);
      reloadDashboard();
    }
  };

  const setCourtStatus = (court, status) =>
    mutate(
      court.id,
      supabase.from("courts").update({ status }).eq("id", court.id),
      () => {
        setCourts((items) =>
          items.map((item) =>
            item.id === court.id ? { ...item, status } : item,
          ),
        );
        reloadDashboard();
      },
    );

  const deleteCourt = async (court) => {
    if (
      !(await confirmAction(
        "Delete court?",
        `Permanently delete "${court.name}"? Courts with active reservations cannot be deleted — close them instead.`,
      ))
    )
      return;
    mutate(
      court.id,
      supabase.from("courts").delete().eq("id", court.id),
      () => {
        setCourts((items) => items.filter((item) => item.id !== court.id));
        reloadDashboard();
      },
      "Could not delete court",
    );
  };

  // ── Reservations ─────────────────────────────────────────────────────────────

  // The player is notified of every status change by the database trigger
  // private.notify_reservation_status (see the reservation status migration),
  // so nothing is inserted from here; that also keeps one notification per change.
  const setReservationStatus = async (r, status) => {
    const player = namesById[r.user_id] || "this player";
    const where = r.courts?.name || "this court";
    if (status === "cancelled" && !(await confirmAction("Cancel reservation?", `Cancel ${player}'s booking at ${where}?`, "Cancel reservation"))) return;
    if (status === "declined" && !(await confirmAction("Decline booking?", `Decline ${player}'s request for ${where}? The slot opens up and they'll be notified.`, "Decline"))) return;

    await mutate(
      r.id,
      supabase.from("reservations").update({ status }).eq("id", r.id),
      () => {
        setReservations((items) =>
          status === "cancelled" || status === "declined"
            ? items.filter((item) => item.id !== r.id)
            : items.map((item) => (item.id === r.id ? { ...item, status } : item)),
        );
      },
      status === "declined" ? "Could not decline booking" : "Could not update reservation",
    );
  };

  // ── Reported posts ───────────────────────────────────────────────────────────

  const dropReport = (post) => {
    setReportedPosts((items) => items.filter((item) => item.id !== post.id));
    setCounts((v) => ({ ...v, reports: Math.max(0, v.reports - 1) }));
  };

  const restorePost = (post) =>
    mutate(
      post.id,
      supabase
        .from("community_posts")
        .update({ is_reported: false })
        .eq("id", post.id),
      () => dropReport(post),
    );

  const deletePost = async (post) => {
    if (
      !(await confirmAction("Delete post?", "Permanently remove this reported post?"))
    )
      return;
    mutate(
      post.id,
      supabase.from("community_posts").delete().eq("id", post.id),
      () => dropReport(post),
      "Could not delete post",
    );
  };

  // ── Directory ────────────────────────────────────────────────────────────────

  const toggleDirectory = (profile) => {
    const is_directory_visible = !profile.is_directory_visible;
    mutate(
      profile.id,
      supabase
        .from("profiles")
        .update({ is_directory_visible })
        .eq("id", profile.id),
      () =>
        setProfiles((items) =>
          items.map((item) =>
            item.id === profile.id
              ? { ...item, is_directory_visible }
              : item,
          ),
        ),
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  // While a court form is open, render it full-screen so the keyboard doesn't
  // fight the outer ScrollView.
  if (courtEditor !== null && authorized) {
    const editingCourt =
      courtEditor === "new"
        ? null
        : courts.find((c) => c.id === courtEditor);
    return (
      <View style={styles.screen}>
        <OverlayHeader
          title={courtEditor === "new" ? "Add court" : "Edit court"}
          subtitle={editingCourt?.name}
          onBack={() => setCourtEditor(null)}
        />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={{ padding: S.xl, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <CourtForm
            initial={
              courtEditor === "new" ? emptyCourt : courtToForm(editingCourt)
            }
            saving={savingId === courtEditor}
            onSubmit={saveCourt}
            onCancel={() => setCourtEditor(null)}
            userId={userId}
            details={courtDetailsSupported}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <OverlayHeader
        title="Admin"
        subtitle="Courts, reservations and moderation"
        onBack={onBack}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: S.xl, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {authorized === null ? (
          <ActivityIndicator color={C.volt} style={{ marginTop: 28 }} />
        ) : !authorized ? (
          <ErrorNote style={{ marginHorizontal: 0 }}>
            This screen is restricted to administrators.
          </ErrorNote>
        ) : (
          <View>
            {/* Stat cards */}
            <View style={styles.adminGrid}>
              {[
                ["Courts", courts.length],
                ["Reservations", counts?.reservations],
                ["Reported", counts?.reports],
              ].map(([label, value]) => (
                <View key={label} style={styles.adminStatCard}>
                  <Text style={styles.statValue}>{value ?? "…"}</Text>
                  <Text style={styles.statLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <ErrorNote style={{ marginHorizontal: 0 }}>{error}</ErrorNote>

            {/* ── Courts section ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle
                action="+ Add court"
                onAction={() => setCourtEditor("new")}
              >
                Courts
              </SectionTitle>
            </View>

            {courts.length === 0 ? (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="tennisball-outline"
                  title="No courts yet"
                  message="Add the first court so players can start booking."
                />
              </View>
            ) : (
              courts.map((court) => (
                <CourtAdminRow
                  key={court.id}
                  court={court}
                  savingId={savingId}
                  onEdit={() => setCourtEditor(court.id)}
                  onToggleStatus={() =>
                    setCourtStatus(
                      court,
                      court.status === "Closed" ? "Available" : "Closed",
                    )
                  }
                  onDelete={() => deleteCourt(court)}
                />
              ))
            )}

            {/* ── Upcoming reservations ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Upcoming reservations</SectionTitle>
            </View>
            {reservations.length ? (
              reservations.map((r) => (
                <AdminRow
                  key={r.id}
                  title={`${r.courts?.name || "Court"} · ${namesById[r.user_id] || "Player"}`}
                  hint={reservationTime(r)}
                  right={
                    <Text
                      style={{
                        color:
                          r.status === "confirmed" ? C.volt : C.butter,
                        fontSize: 12,
                        fontWeight: "800",
                      }}
                    >
                      {r.status.toUpperCase()}
                    </Text>
                  }
                >
                  {adminActionsFor(r).includes("confirm") ? (
                    <Button
                      variant="secondary"
                      icon="checkmark"
                      label="Confirm"
                      onPress={() => setReservationStatus(r, "confirmed")}
                      disabled={savingId === r.id}
                      style={small}
                    />
                  ) : null}
                  {adminActionsFor(r).includes("decline") ? (
                    <Button
                      variant="ghost"
                      icon="close"
                      label="Decline"
                      onPress={() => setReservationStatus(r, "declined")}
                      disabled={savingId === r.id}
                      style={small}
                      accessibilityLabel={`Decline ${namesById[r.user_id] || "player"}'s booking`}
                    />
                  ) : null}
                  {adminActionsFor(r).includes("cancel") ? (
                    <Button
                      variant="ghost"
                      label="Cancel"
                      onPress={() => setReservationStatus(r, "cancelled")}
                      disabled={savingId === r.id}
                      style={small}
                    />
                  ) : null}
                </AdminRow>
              ))
            ) : (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="calendar-outline"
                  title="Nothing upcoming"
                  message="New bookings will appear here for confirmation."
                />
              </View>
            )}

            {/* ── Reported posts ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Reported posts</SectionTitle>
            </View>
            {reportedPosts.length ? (
              reportedPosts.map((post) => (
                <AdminRow
                  key={post.id}
                  title={post.body}
                  hint={`By ${namesById[post.author_id] || post.author_id}`}
                >
                  <Button
                    variant="secondary"
                    label="Restore"
                    onPress={() => restorePost(post)}
                    disabled={savingId === post.id}
                    style={small}
                    accessibilityLabel="Restore this reported post"
                  />
                  <Button
                    variant="ghost"
                    icon="trash-outline"
                    label="Delete"
                    onPress={() => deletePost(post)}
                    disabled={savingId === post.id}
                    style={small}
                    accessibilityLabel="Delete this reported post"
                  />
                </AdminRow>
              ))
            ) : (
              <View style={{ marginTop: S.md }}>
                <EmptyCard
                  icon="checkmark-done-outline"
                  title="Queue is clear"
                  message="No posts are awaiting moderation."
                />
              </View>
            )}

            {/* ── Directory visibility ── */}
            <View style={{ marginTop: S.xxl }}>
              <SectionTitle>Directory visibility</SectionTitle>
            </View>
            {profiles.map((profile) => (
              <View key={profile.id} style={styles.adminAction}>
                <View style={{ flex: 1, paddingRight: S.md }}>
                  <Text style={styles.adminActionTitle} numberOfLines={1}>
                    {profile.display_name || "Unnamed player"}
                  </Text>
                  <Text style={styles.adminActionHint}>
                    {profile.is_directory_visible
                      ? "Visible in directory"
                      : "Hidden from directory"}
                  </Text>
                </View>
                <Switch
                  value={profile.is_directory_visible}
                  onValueChange={() => toggleDirectory(profile)}
                  disabled={savingId === profile.id}
                  trackColor={{ false: C.surface2, true: C.brand }}
                  thumbColor={
                    profile.is_directory_visible ? C.volt : C.paper
                  }
                  accessibilityLabel={`Show ${profile.display_name || "player"} in directory`}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
