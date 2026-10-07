import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor } from "../utils/format";
import { Avatar, Button, C, EmptyCard, ErrorNote, HeaderBar, Icon, IconBtn, S, ScreenFrame, styles } from "./shared";
import { notify } from "../utils/confirm";

const PAGE_SIZE = 40;
const BASE_COLUMNS = "id, display_name, avatar_url, skill_level, preferred_game_type, location";
export const SKILL_FILTERS = [
  { key: "any", label: "Any level", min: 0, max: 5 },
  { key: "beginner", label: "1.0–2.5", min: 1, max: 2.5 },
  { key: "intermediate", label: "3.0–3.5", min: 3, max: 3.5 },
  { key: "advanced", label: "4.0+", min: 4, max: 5 },
];
export const AVAILABILITY = ["Weekday mornings", "Weekday evenings", "Weekends"];

// Name search + game type + skill band + (any of) the chosen play times.
export function filterPlayers(players, { query = "", gameType = "All", skill = "any", times = [] }) {
  const band = SKILL_FILTERS.find((s) => s.key === skill) || SKILL_FILTERS[0];
  const term = query.trim().toLowerCase();
  return players.filter((player) => {
    const level = Number(player.skill_level || 3);
    return (player.display_name || "").toLowerCase().includes(term)
      && (gameType === "All" || player.preferred_game_type === gameType || player.preferred_game_type === "Either")
      && level >= band.min && level <= band.max
      && (!times.length || (player.availability || []).some((t) => times.includes(t)));
  });
}

function connectionLabel(state) {
  if (!state) return "Connect";
  if (state.status === "accepted") return "Connected";
  return state.requesterIsMe ? "Requested" : "Accept";
}

function connectionIcon(state) {
  if (!state) return "person-add-outline";
  if (state.status === "accepted") return "people";
  return state.requesterIsMe ? "checkmark" : "checkmark-circle";
}

function PlayersTab({ user }) {
  const { setChatView } = useOverlayNav();
  const [connections, setConnections] = useState({});
  const [connectingFor, setConnectingFor] = useState("");
  const [invitingFor, setInvitingFor] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [gameType, setGameType] = useState("All");
  const [skill, setSkill] = useState("any");
  const [times, setTimes] = useState([]);
  // profiles.availability comes from a later migration; hide the filter until then.
  const [availabilitySupported, setAvailabilitySupported] = useState(true);
  const [openingChatFor, setOpeningChatFor] = useState("");

  const openChatWith = async (player) => {
    if (!supabase || openingChatFor) return;
    setOpeningChatFor(player.id);
    const { data: conversationId, error: rpcError } = await supabase.rpc("find_or_create_direct_conversation", { other_user_id: player.id });
    setOpeningChatFor("");
    if (rpcError) {
      notify("Could not open chat", rpcError.message);
      return;
    }
    setChatView({
      id: conversationId,
      name: player.display_name || "DinkTagum player",
      initials: initialsFor(player.display_name),
      avatarUrl: player.avatar_url,
    });
  };

  const requestConnection = async (player) => {
    if (!supabase || connectingFor) return;
    setConnectingFor(player.id);
    const { data, error: rpcError } = await supabase.rpc("request_player_connection", { other_user_id: player.id });
    setConnectingFor("");
    if (rpcError) { notify("Could not send connection request", rpcError.message); return; }
    setConnections((current) => ({ ...current, [player.id]: { status: data.status, requesterIsMe: data.requester_id === user.id } }));
  };

  const inviteToGame = async (player) => {
    if (!supabase || invitingFor) return;
    setInvitingFor(player.id);
    const { error: rpcError } = await supabase.rpc("invite_player_to_game", { p_recipient_id: player.id });
    setInvitingFor("");
    if (rpcError) { notify("Could not send invite", rpcError.message); return; }
    notify("Invite sent", `${player.display_name || "This player"} will see your invite in Notifications.`);
  };

  const loadConnections = async () => {
    if (!supabase) return;
    const { data } = await supabase.from("player_connections").select("requester_id, recipient_id, status").or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
    const map = {};
    for (const row of data || []) {
      const otherId = row.requester_id === user.id ? row.recipient_id : row.requester_id;
      map[otherId] = { status: row.status, requesterIsMe: row.requester_id === user.id };
    }
    setConnections(map);
  };

  const loadPlayers = async (page) => {
    if (!supabase) return;
    const from = page * PAGE_SIZE;
    const query = (columns) => supabase
      .from("profiles")
      .select(columns)
      .eq("is_directory_visible", true)
      .neq("id", user?.id || "")
      .order("display_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    let { data, error: directoryError } = await query(availabilitySupported ? `${BASE_COLUMNS}, availability` : BASE_COLUMNS);
    if (directoryError && availabilitySupported && (directoryError.code === "42703" || /availability/.test(directoryError.message))) {
      setAvailabilitySupported(false);
      ({ data, error: directoryError } = await query(BASE_COLUMNS));
    }
    if (directoryError) { setError(`Player directory could not be loaded: ${directoryError.message}`); return; }
    setPlayers((current) => (page === 0 ? data || [] : [...current, ...(data || [])]));
    setHasMore((data || []).length === PAGE_SIZE);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await Promise.all([loadPlayers(0), loadConnections()]);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when the signed-in user changes
  }, [user?.id]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    await Promise.all([loadPlayers(0), loadConnections()]);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPlayers(Math.floor(players.length / PAGE_SIZE));
    setLoadingMore(false);
  };

  const visiblePlayers = filterPlayers(players, { query, gameType, skill, times });
  const filtersActive = Boolean(query || gameType !== "All" || skill !== "any" || times.length);
  const toggleTime = (t) => setTimes((current) => (current.includes(t) ? current.filter((x) => x !== t) : [...current, t]));
  const chip = (key, label, active, onPress) => (
    <TouchableOpacity key={key} onPress={onPress} style={[styles.chip, { minHeight: 44, justifyContent: "center" }, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      data={loading ? [] : visiblePlayers}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.volt} colors={[C.volt]} progressBackgroundColor={C.surface} />}
      renderItem={({ item: p }) => {
        const connectionState = connections[p.id];
        return (
          <View style={{ paddingHorizontal: S.xl }}>
            <View style={styles.playerRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Avatar initials={initialsFor(p.display_name)} uri={p.avatar_url} size={50} ring />
                <View style={{ flex: 1, marginLeft: S.md }}>
                  <Text style={styles.playerName} numberOfLines={1}>{p.display_name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3 }}>
                    <Icon name="location-outline" size={13} color={C.textDim} />
                    <Text style={[styles.playerSub, { marginTop: 0, marginLeft: 3 }]} numberOfLines={1}>{p.location || "Tagum City"} · {p.preferred_game_type || "Doubles"}</Text>
                  </View>
                  {p.availability?.length ? <Text style={[styles.playerSub, { color: C.mist }]} numberOfLines={1}>Plays {p.availability.join(", ").toLowerCase()}</Text> : null}
                </View>
                <View style={styles.levelBadge} accessibilityLabel={`Skill level ${p.skill_level || "3.0"}`}><Text style={styles.levelBadgeText}>{p.skill_level || "3.0"}</Text></View>
              </View>
              <View style={styles.playerActions}>
                <Button
                  variant="ghost"
                  icon="chatbubble-outline"
                  label={openingChatFor === p.id ? "Opening…" : "Message"}
                  onPress={() => openChatWith(p)}
                  disabled={openingChatFor === p.id}
                  style={{ flex: 1 }}
                  accessibilityLabel={`Message ${p.display_name}`}
                />
                <Button
                  variant={connectionState?.status === "accepted" || connectionState?.requesterIsMe ? "ghost" : "secondary"}
                  icon={connectionIcon(connectionState)}
                  label={connectingFor === p.id ? "…" : connectionLabel(connectionState)}
                  onPress={() => requestConnection(p)}
                  disabled={connectingFor === p.id || connectionState?.status === "accepted"}
                  style={{ flex: 1 }}
                  accessibilityLabel={connectionState?.status === "accepted" ? `Connected with ${p.display_name}` : connectionState?.requesterIsMe ? `Connection request sent to ${p.display_name}` : `Connect with ${p.display_name}`}
                />
                <IconBtn
                  name="tennisball-outline"
                  variant="ghost"
                  onPress={() => inviteToGame(p)}
                  accessibilityLabel={`Invite ${p.display_name} to play`}
                />
              </View>
            </View>
          </View>
        );
      }}
      ListHeaderComponent={
        <>
          <HeaderBar showBack title="Find Players" subtitle={loading ? "Loading player directory…" : `${visiblePlayers.length} player${visiblePlayers.length === 1 ? "" : "s"} in Tagum City`} />
          <View style={{ paddingHorizontal: S.xl, marginTop: S.lg }}>
            <View style={styles.searchField}>
              <Icon name="search" size={18} color={C.textDim} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search by name" placeholderTextColor={C.textFaint} style={styles.searchInput} accessibilityLabel="Search players" autoCorrect={false} />
              {query ? <TouchableOpacity onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}><Icon name="close-circle" size={18} color={C.textDim} /></TouchableOpacity> : null}
            </View>
          </View>
          <Text style={playerFilterLabel}>Game type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: S.xl }}>
            {["All", "Singles", "Doubles"].map((type) => chip(type, type, gameType === type, () => setGameType(type)))}
          </ScrollView>
          <Text style={playerFilterLabel}>Skill level</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: S.xl }}>
            {SKILL_FILTERS.map((band) => chip(band.key, band.label, skill === band.key, () => setSkill(band.key)))}
          </ScrollView>
          {availabilitySupported ? (
            <>
              <Text style={playerFilterLabel}>Usually plays</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: S.xl }}>
                {AVAILABILITY.map((t) => chip(t, t, times.includes(t), () => toggleTime(t)))}
              </ScrollView>
            </>
          ) : null}
          <View style={{ height: S.lg }} />
        </>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: S.xl }}>
          {loading ? <ActivityIndicator color={C.volt} /> : <EmptyCard icon="people-outline" title="No players found" message={filtersActive ? "Try a different name or filter." : "Players who join the directory will show up here."}>
            {filtersActive ? <Button label="Clear filters" icon="refresh" onPress={() => { setQuery(""); setGameType("All"); setSkill("any"); setTimes([]); }} style={{ marginTop: S.lg, minHeight: 44 }} /> : null}
          </EmptyCard>}
        </View>
      }
      ListFooterComponent={
        <>
          {!loading && hasMore && !filtersActive ? (
            <TouchableOpacity onPress={loadMore} disabled={loadingMore} accessibilityRole="button" accessibilityLabel="Load more players" style={{ alignSelf: "center", marginTop: S.md }}>
              {loadingMore ? <ActivityIndicator color={C.volt} /> : <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700" }}>Load more players</Text>}
            </TouchableOpacity>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
        </>
      }
    />
  );
}

export function DirectoryScreen() {
  const { session } = useAuth();
  return <ScreenFrame><PlayersTab user={session.user} /></ScreenFrame>;
}

const playerFilterLabel = { color: C.mist, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.3, marginTop: S.md, marginBottom: 6, marginHorizontal: S.xl };
