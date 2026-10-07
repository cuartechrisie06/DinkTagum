import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { notify } from "../utils/confirm";
import { useAuth } from "./AuthContext";

const GameRecordsContext = createContext(null);
const LEGACY_COLUMNS = "id, played_on, opponents, player_score, opponent_score, result";
// Added by the open-play/match-confirmation migration. Until that migration is
// applied the provider falls back to LEGACY_COLUMNS so History keeps working.
const COLUMNS = `${LEGACY_COLUMNS}, opponent_id, confirmation_status, source_record_id`;

// Mirrors the game_records table checks so players get a clear message before
// a round trip: opponents 1–240 chars, scores 0–99, no ties, ISO date not in the
// future. Keyed by field so the form can show each message under its input.
export function gameRecordFieldErrors({ played_on, opponents, player_score, opponent_score }) {
  const errors = {};
  const name = String(opponents ?? "").trim();
  const date = String(played_on ?? "").trim();
  const mineText = String(player_score ?? "").trim();
  const theirsText = String(opponent_score ?? "").trim();
  const mine = Number(mineText);
  const theirs = Number(theirsText);
  const validScore = (text, score) => text !== "" && Number.isInteger(score) && score >= 0 && score <= 99;

  if (!name) errors.opponents = "Enter who you played against.";
  else if (name.length > 240) errors.opponents = "Opponent names must be 240 characters or fewer.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) errors.played_on = "Use the date format YYYY-MM-DD.";
  else if (new Date(`${date}T00:00:00`).getTime() > Date.now()) errors.played_on = "The match date cannot be in the future.";
  if (!mineText) errors.player_score = "Enter your score.";
  else if (!validScore(mineText, mine)) errors.player_score = "Whole number from 0 to 99.";
  if (!theirsText) errors.opponent_score = "Enter their score.";
  else if (!validScore(theirsText, theirs)) errors.opponent_score = "Whole number from 0 to 99.";
  if (!errors.player_score && !errors.opponent_score && mine === theirs) errors.opponent_score = "Pickleball games can't end in a tie — check the scores.";
  return errors;
}

export function validateGameRecord(input) {
  const errors = gameRecordFieldErrors(input);
  const first = Object.values(errors)[0];
  if (first) return { error: first, errors };
  return {
    value: {
      played_on: String(input.played_on).trim(),
      opponents: String(input.opponents).trim(),
      player_score: Number(input.player_score),
      opponent_score: Number(input.opponent_score),
      opponent_id: input.opponent_id || null,
    },
  };
}

export function sortRecords(records) {
  return records.slice().sort((a, b) => (a.played_on < b.played_on ? 1 : a.played_on > b.played_on ? -1 : 0));
}

// Display info for a record's confirmation state, or null when there's
// nothing to show (no tagged opponent).
export function confirmationBadge(record) {
  switch (record.confirmation_status) {
    case "confirmed": return { label: "Verified", icon: "shield-checkmark", tone: "volt" };
    case "pending": return { label: "Awaiting confirmation", icon: "time-outline", tone: "butter" };
    case "disputed": return { label: "Disputed · edit to resend", icon: "alert-circle-outline", tone: "butter" };
    default: return null;
  }
}

// Confirmed scores are locked by the database trigger.
export function canEditRecord(record) {
  return record.confirmation_status !== "confirmed";
}

// Drops opponent tagging when the database predates match confirmation.
function payloadFor(value, columns) {
  if (columns === COLUMNS) return value;
  const { opponent_id: _ignored, ...legacy } = value;
  return legacy;
}

function isMissingColumn(error) {
  return error?.code === "42703" || /column .* does not exist/i.test(error?.message || "");
}

// Mounted only while signed in (see app/_layout.jsx), keyed by user id.
export function GameRecordsProvider({ children }) {
  const { session } = useAuth();
  const userId = session.user.id;
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState([]);
  const [respondingId, setRespondingId] = useState("");
  const [confirmationSupported, setConfirmationSupported] = useState(true);
  const columnsRef = useRef(COLUMNS);

  const loadRecords = useCallback(async () => {
    if (!supabase) return;
    const query = (columns) => supabase.from("game_records").select(columns).eq("player_id", userId).order("played_on", { ascending: false }).limit(1000);
    let { data, error: queryError } = await query(columnsRef.current);
    if (queryError && isMissingColumn(queryError) && columnsRef.current !== LEGACY_COLUMNS) {
      columnsRef.current = LEGACY_COLUMNS;
      setConfirmationSupported(false);
      ({ data, error: queryError } = await query(LEGACY_COLUMNS));
    }
    if (queryError) setError(`Match history could not be loaded: ${queryError.message}`);
    else { setRecords(data || []); setError(""); }
    setLoading(false);
  }, [userId]);

  const loadPending = useCallback(async () => {
    if (!supabase || columnsRef.current === LEGACY_COLUMNS) return;
    const { data, error: rpcError } = await supabase.rpc("list_pending_match_confirmations");
    if (!rpcError) setPending(Array.isArray(data) ? data : []);
  }, []);

  const reload = useCallback(async () => {
    await loadRecords();
    await loadPending();
  }, [loadRecords, loadPending]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() sets state after its awaits
    reload();
    if (!supabase) return undefined;
    // RLS scopes game_records to rows where we're the player or the tagged
    // opponent, so these events are exactly the ones that affect our lists.
    const channel = supabase
      .channel(`game-records-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_records" }, reload)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, reload]);

  const createRecord = useCallback(async (input) => {
    const { value, error: invalid } = validateGameRecord(input);
    if (invalid) { notify("Check the match details", invalid); return false; }
    setSaving(true);
    const { data, error: insertError } = await supabase.from("game_records").insert({ ...payloadFor(value, columnsRef.current), player_id: userId }).select(columnsRef.current).single();
    setSaving(false);
    if (insertError) { notify("Could not save match", insertError.message); return false; }
    setRecords((current) => sortRecords([data, ...current]));
    return true;
  }, [userId]);

  const updateRecord = useCallback(async (id, input) => {
    const { value, error: invalid } = validateGameRecord(input);
    if (invalid) { notify("Check the match details", invalid); return false; }
    setSaving(true);
    const { data, error: updateError } = await supabase.from("game_records").update(payloadFor(value, columnsRef.current)).eq("id", id).eq("player_id", userId).select(columnsRef.current).single();
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

  // The tagged opponent confirms (adds the mirrored result to their own
  // history) or disputes (the reporter can correct and resend).
  const respondToMatch = useCallback(async (recordId, confirm) => {
    setRespondingId(recordId);
    const { error: rpcError } = await supabase.rpc("respond_match_confirmation", { p_record_id: recordId, p_confirm: confirm });
    setRespondingId("");
    if (rpcError) { notify(confirm ? "Could not confirm match" : "Could not dispute match", rpcError.message); return false; }
    setPending((current) => current.filter((row) => row.record_id !== recordId));
    if (confirm) await loadRecords();
    return true;
  }, [loadRecords]);

  const value = { records, loading, error, saving, createRecord, updateRecord, deleteRecord, reload, pending, respondingId, respondToMatch, confirmationSupported };
  return <GameRecordsContext.Provider value={value}>{children}</GameRecordsContext.Provider>;
}

export function useGameRecords() {
  const value = useContext(GameRecordsContext);
  if (!value) throw new Error("useGameRecords must be used within GameRecordsProvider");
  return value;
}
