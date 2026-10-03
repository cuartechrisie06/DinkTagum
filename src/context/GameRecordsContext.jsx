import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { useAuth } from "./AuthContext";

const GameRecordsContext = createContext(null);
const COLUMNS = "id, played_on, opponents, player_score, opponent_score, result";

// Mirrors the game_records table checks so players get a clear message before
// a round trip: opponents 1–240 chars, scores 0–99, no ties, ISO date not in the future.
export function validateGameRecord({ played_on, opponents, player_score, opponent_score }) {
  const name = String(opponents ?? "").trim();
  const mine = Number(player_score);
  const theirs = Number(opponent_score);
  const date = String(played_on ?? "").trim();
  if (!name) return { error: "Enter who you played against." };
  if (name.length > 240) return { error: "Opponent names must be 240 characters or fewer." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) return { error: "Use the date format YYYY-MM-DD." };
  if (new Date(`${date}T00:00:00`).getTime() > Date.now()) return { error: "The match date cannot be in the future." };
  if (String(player_score).trim() === "" || String(opponent_score).trim() === "") return { error: "Enter both scores." };
  if (![mine, theirs].every((score) => Number.isInteger(score) && score >= 0 && score <= 99)) return { error: "Scores must be whole numbers from 0 to 99." };
  if (mine === theirs) return { error: "Pickleball games can't end in a tie — check the scores." };
  return { value: { played_on: date, opponents: name, player_score: mine, opponent_score: theirs } };
}

export function sortRecords(records) {
  return records.slice().sort((a, b) => (a.played_on < b.played_on ? 1 : a.played_on > b.played_on ? -1 : 0));
}

// Mounted only while signed in (see app/_layout.jsx), keyed by user id.
export function GameRecordsProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase.from("game_records").select(COLUMNS).eq("player_id", userId).order("played_on", { ascending: false }).limit(1000);
      if (!active) return;
      if (queryError) setError(`Match history could not be loaded: ${queryError.message}`);
      else { setRecords(data || []); setError(""); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const createRecord = useCallback(async (input) => {
    const { value, error: invalid } = validateGameRecord(input);
    if (invalid) { notify("Check the match details", invalid); return false; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from("game_records").insert({ ...value, player_id: userId }).select(COLUMNS).single();
    setSaving(false);
    if (insertError) { notify("Could not save match", insertError.message); return false; }
    setRecords((current) => sortRecords([data, ...current]));
    return true;
  }, [userId]);

  const updateRecord = useCallback(async (id, input) => {
    const { value, error: invalid } = validateGameRecord(input);
    if (invalid) { notify("Check the match details", invalid); return false; }
    setSaving(true);
    const { data, error: updateError } = await supabase.from("game_records").update(value).eq("id", id).eq("player_id", userId).select(COLUMNS).single();
    setSaving(false);
    if (updateError) { notify("Could not update match", updateError.message); return false; }
    setRecords((current) => sortRecords(current.map((record) => (record.id === id ? data : record))));
    return true;
  }, [userId]);

  const deleteRecord = useCallback(async (id) => {
    const { error: deleteError } = await supabase.from("game_records").delete().eq("id", id).eq("player_id", userId);
    if (deleteError) { notify("Could not delete match", deleteError.message); return false; }
    setRecords((current) => current.filter((record) => record.id !== id));
    return true;
  }, [userId]);

  const value = { records, loading, error, saving, createRecord, updateRecord, deleteRecord };
  return <GameRecordsContext.Provider value={value}>{children}</GameRecordsContext.Provider>;
}

export function useGameRecords() {
  const value = useContext(GameRecordsContext);
  if (!value) throw new Error("useGameRecords must be used within GameRecordsProvider");
  return value;
}
