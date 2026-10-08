import React from "react";
import { Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { suggestCourts, suggestionLabel } from "../utils/courts";
import { notify } from "../utils/confirm";
import { Button, C, Icon, R, S } from "./shared";

export const INVITE_MESSAGE = "Join me on DinkTagum, Tagum City's pickleball app: find open courts, book a slot and get a game going. Search \"DinkTagum\" or ask me for the link!";

export async function inviteFriend() {
  try {
    await Share.share({ message: INVITE_MESSAGE });
  } catch {
    notify("Couldn't open sharing", "Copy the app name and send it to a friend instead.");
  }
}

// Replaces dead-end empty states ("No upcoming games", "No open games yet")
// with something to do next: courts with open slots, host a game, invite.
export function GameSuggestions({ courts, onOpenCourt, onHost, hostLabel = "Host a game", intro, showCourts = true }) {
  const picks = suggestCourts(courts);
  return (
    <View style={suggestStyles.card}>
      {intro ? <Text style={suggestStyles.intro}>{intro}</Text> : null}
      {!showCourts ? null : picks.length ? (
        <View style={{ gap: S.xs }}>
          <Text style={suggestStyles.heading}>Open slots nearby</Text>
          {picks.map((court) => (
            <TouchableOpacity key={court.id} onPress={() => onOpenCourt(court)} style={suggestStyles.row} accessibilityRole="button" accessibilityLabel={`${court.name}, ${suggestionLabel(court)}. Open court`}>
              <View style={suggestStyles.rowIcon}><Icon name="tennisball" size={15} color={C.volt} /></View>
              <View style={{ flex: 1 }}>
                <Text style={suggestStyles.rowTitle} numberOfLines={1}>{court.name}</Text>
                <Text style={suggestStyles.rowSub} numberOfLines={1}>{suggestionLabel(court)}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={C.textDim} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={suggestStyles.intro}>No open slots found right now. Host a game and others can join, or invite a friend.</Text>
      )}
      <View style={suggestStyles.actions}>
        <Button variant="secondary" icon="megaphone-outline" label={hostLabel} onPress={() => onHost(picks[0] || null)} style={{ flex: 1, minHeight: 44 }} />
        <Button variant="ghost" icon="person-add-outline" label="Invite a friend" onPress={inviteFriend} style={{ flex: 1, minHeight: 44 }} />
      </View>
    </View>
  );
}

const suggestStyles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg, gap: S.md },
  intro: { color: C.textDim, fontSize: 13.5, lineHeight: 19 },
  heading: { color: C.mist, fontSize: 12, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 52, paddingVertical: S.xs },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: C.paper, fontSize: 14.5, fontWeight: "700" },
  rowSub: { color: C.textDim, fontSize: 12.5, marginTop: 1 },
  actions: { flexDirection: "row", gap: S.sm },
});
