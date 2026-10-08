import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { useAuth } from "./AuthContext";
import { parseSlotLabel } from "./DashboardContext";

const OpenPlayContext = createContext(null);

export const OPEN_PLAY_FORMATS = ["Doubles", "Singles"];
export const SKILL_RANGES = [
  { key: "any", label: "Any level", min: null, max: null },
  { key: "beginner", label: "1.0–2.5", min: 1.0, max: 2.5 },
  { key: "intermediate", label: "3.0–3.5", min: 3.0, max: 3.5 },
  { key: "advanced", label: "4.0+", min: 4.0, max: 5.0 },
];

export function capacityFor(format) {
  return format === "Singles" ? 2 : 4;
}

// Builds the open_games row from the host form, mirroring the table checks.
export function buildOpenGame({ courtId, dayKey, timeLabel, format, skillKey, note }, now = Date.now()) {
  if (!courtId) return { error: "Pick a court for your game." };
  if (!dayKey || !timeLabel) return { error: "Pick a day and start time." };
  if (!OPEN_PLAY_FORMATS.includes(format)) return { error: "Choose Singles or Doubles." };
  const { hour, minute } = parseSlotLabel(timeLabel);
  const start = new Date(`${dayKey}T00:00:00`);
  start.setHours(hour, minute, 0, 0);
  if (Number.isNaN(start.getTime()) || start.getTime() <= now) return { error: "Pick a start time that hasn't passed yet." };
  const trimmed = String(note ?? "").trim();
  if (trimmed.length > 280) return { error: "Keep the note under 280 characters." };
  const skill = SKILL_RANGES.find((range) => range.key === skillKey) || SKILL_RANGES[0];
  return {
    value: {
      court_id: courtId,
      starts_at: start.toISOString(),
      format,
      skill_min: skill.min,
      skill_max: skill.max,
      note: trimmed || null,
    },
  };
}

export function skillLabel(game) {
  if (game.skill_min == null && game.skill_max == null) return "Any level";
  if (game.skill_max == null || Number(game.skill_max) >= 5) return `${Number(game.skill_min).toFixed(1)}+`;
  return `${Number(game.skill_min).toFixed(1)}–${Number(game.skill_max).toFixed(1)}`;
}

// Normalizes a list_open_games row for display.
export function openGameForDisplay(row, userId) {
  const players = Array.isArray(row.players) ? row.players : [];
  const capacity = row.capacity || capacityFor(row.format);
  return {
    ...row,
    id: row.game_id,
    players,
    capacity,
    spotsLeft: Math.max(0, capacity - players.length),
    isFull: players.length >= capacity,
    isHost: row.host_id === userId,
    isJoined: players.some((p) => p.id === userId),
  };
}

// Mounted only while signed in (see app/_layout.jsx), keyed by user id.
export function OpenPlayProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  // False until the open-play migration is applied to the database; the UI
  // hides open play rather than showing a schema error.
  const [available, setAvailable] = useState(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: rpcError } = await supabase.rpc("list_open_games");
    if (rpcError?.code === "PGRST202") setAvailable(false);
    else if (rpcError) setError(`Open games could not be loaded: ${rpcError.message}`);
    else { setGames((data || []).map((row) => openGameForDisplay(row, userId))); setError(""); setAvailable(true); }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after its await
    load();
    if (!supabase) return undefined;
    const channel = supabase
      .channel(`open-play-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "open_games" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "open_game_players" }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, load]);

  const run = useCallback(async (id, request, failTitle) => {
    setBusyId(id);
    const { error: requestError } = await request;
    setBusyId("");
    if (requestError) { notify(failTitle, requestError.message); return false; }
    await load();
    return true;
  }, [load]);

  const hostGame = useCallback(async (input) => {
    const { value, error: invalid } = buildOpenGame(input);
    if (invalid) { notify("Check your game details", invalid); return false; }
    return run("new", supabase.from("open_games").insert({ ...value, host_id: userId }), "Could not post game");
  }, [run, userId]);

  const joinGame = useCallback((id) => run(id, supabase.rpc("join_open_game", { p_game_id: id }), "Could not join game"), [run]);
  const leaveGame = useCallback((id) => run(id, supabase.rpc("leave_open_game", { p_game_id: id }), "Could not leave game"), [run]);
  const cancelGame = useCallback((id) => run(id, supabase.from("open_games").update({ status: "cancelled" }).eq("id", id).eq("host_id", userId), "Could not cancel game"), [run, userId]);
  const updateNote = useCallback((id, note) => run(id, supabase.from("open_games").update({ note: note.trim() || null }).eq("id", id).eq("host_id", userId), "Could not update game"), [run, userId]);

  const value = { games, loading, error, busyId, available, reload: load, hostGame, joinGame, leaveGame, cancelGame, updateNote };
  return <OpenPlayContext.Provider value={value}>{children}</OpenPlayContext.Provider>;
}

// For screens that also render outside the provider (e.g. in tests).
export function useOpenPlayOptional() {
  return useContext(OpenPlayContext);
}

export function useOpenPlay() {
  const value = useContext(OpenPlayContext);
  if (!value) throw new Error("useOpenPlay must be used within OpenPlayProvider");
  return value;
}
