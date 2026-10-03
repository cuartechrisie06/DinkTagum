import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor } from "../utils/format";
import { Avatar, Button, C, EmptyCard, ErrorNote, HeaderBar, Icon, IconBtn, S, ScreenFrame, styles } from "./shared";
import { notify } from "../utils/confirm";

const PAGE_SIZE = 40;

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
    const { data, error: directoryError } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, skill_level, preferred_game_type, location")
      .eq("is_directory_visible", true)
      .neq("id", user?.id || "")
      .order("display_name", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
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

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPlayers(Math.floor(players.length / PAGE_SIZE));
    setLoadingMore(false);
  };

  const visiblePlayers = players.filter((player) => {
    const nameMatches = (player.display_name || "").toLowerCase().includes(query.trim().toLowerCase());
    const typeMatches = gameType === "All" || player.preferred_game_type === gameType || player.preferred_game_type === "Either";
    return nameMatches && typeMatches;
  });

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      data={loading ? [] : visiblePlayers}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md, marginBottom: S.lg }} contentContainerStyle={{ paddingHorizontal: S.xl }}>
            {["All", "Singles", "Doubles"].map((type) => (
              <TouchableOpacity key={type} onPress={() => setGameType(type)} style={[styles.chip, gameType === type && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: gameType === type }}>
                <Text style={[styles.chipText, gameType === type && styles.chipTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: S.xl }}>
          {loading ? <ActivityIndicator color={C.volt} /> : <EmptyCard icon="people-outline" title="No players found" message={query || gameType !== "All" ? "Try a different name or filter." : "Players who join the directory will show up here."} />}
        </View>
      }
      ListFooterComponent={
        <>
          {!loading && hasMore && !query && gameType === "All" ? (
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
