import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useDashboard } from "../context/DashboardContext";
import { useGameRecords } from "../context/GameRecordsContext";
import { computeBadges } from "../utils/badges";
import { biometricStatus, getBiometricPref, setBiometricPref } from "../utils/biometric";
import { pickOption } from "../utils/confirm";
import { C, Icon, R, S, SectionTitle } from "./shared";

// Profile: home court (used for the distance filter on Find Players) and
// badges earned from logged matches.
export function ProfileHighlights() {
  const { courts, homeCourtId, homeCourtSupported, setHomeCourt } = useDashboard();
  const { records, loading } = useGameRecords();
  const homeCourt = courts.find((c) => c.id === homeCourtId) || null;
  const badges = computeBadges(records, { homeCourtId });
  const earnedCount = badges.filter((b) => b.earned).length;

  // Biometric unlock toggle; hidden when the device has no enrolled biometrics.
  const [biometric, setBiometric] = useState({ available: false, label: "biometrics", on: false });
  useEffect(() => {
    let active = true;
    Promise.all([biometricStatus(), getBiometricPref()]).then(([status, pref]) => {
      if (active) setBiometric({ ...status, on: pref === "on" });
    });
    return () => { active = false; };
  }, []);
  const toggleBiometric = (on) => {
    setBiometric((b) => ({ ...b, on }));
    setBiometricPref(on ? "on" : "off");
  };

  const chooseHomeCourt = async () => {
    const options = [
      ...courts.map((c) => ({ key: c.id, label: c.name, icon: c.id === homeCourtId ? "home" : "tennisball-outline" })),
      ...(homeCourtId ? [{ key: "__clear", label: "No home court", icon: "close-circle-outline" }] : []),
    ];
    const choice = await pickOption("Home court", "Where do you usually play? Players nearby can find you by distance.", options);
    if (choice) setHomeCourt(choice === "__clear" ? null : choice);
  };

  return (
    <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
      {homeCourtSupported ? (
        <TouchableOpacity onPress={chooseHomeCourt} style={highlightStyles.homeRow} accessibilityRole="button" accessibilityLabel={homeCourt ? `Home court ${homeCourt.name}. Change` : "Set your home court"}>
          <View style={highlightStyles.homeIcon}><Icon name="home" size={16} color={C.volt} /></View>
          <View style={{ flex: 1 }}>
            <Text style={highlightStyles.homeLabel}>HOME COURT</Text>
            <Text style={highlightStyles.homeValue} numberOfLines={1}>{homeCourt ? homeCourt.name : "Not set"}</Text>
          </View>
          <Text style={highlightStyles.homeAction}>{homeCourt ? "Change" : "Set"}</Text>
        </TouchableOpacity>
      ) : null}

      {biometric.available ? (
        <View style={[highlightStyles.homeRow, { marginTop: S.sm }]}>
          <View style={highlightStyles.homeIcon}><Icon name="finger-print" size={16} color={C.volt} /></View>
          <View style={{ flex: 1 }}>
            <Text style={highlightStyles.homeLabel}>QUICK UNLOCK</Text>
            <Text style={highlightStyles.homeValue}>Unlock with {biometric.label}</Text>
          </View>
          <Switch value={biometric.on} onValueChange={toggleBiometric} trackColor={{ false: C.surface2, true: C.brand }} thumbColor={biometric.on ? C.volt : C.paper} accessibilityLabel={`Unlock with ${biometric.label}`} />
        </View>
      ) : null}

      <View style={{ marginTop: homeCourtSupported ? S.xl : 0 }}>
        <SectionTitle>Badges</SectionTitle>
        <Text style={highlightStyles.sub}>{loading ? "Loading your matches…" : `${earnedCount} of ${badges.length} earned`}</Text>
        <View style={highlightStyles.grid}>
          {badges.map((badge) => (
            <View key={badge.key} style={[highlightStyles.badge, !badge.earned && highlightStyles.badgeLocked]} accessibilityLabel={`${badge.label}, ${badge.earned ? "earned" : `not earned yet: ${badge.hint}`}`}>
              <View style={[highlightStyles.badgeIcon, !badge.earned && { backgroundColor: C.surface2 }]}>
                <Icon name={badge.earned ? badge.icon : "lock-closed"} size={16} color={badge.earned ? C.ink : C.textFaint} />
              </View>
              <Text style={[highlightStyles.badgeLabel, !badge.earned && { color: C.textDim }]} numberOfLines={1}>{badge.label}</Text>
              {!badge.earned ? <Text style={highlightStyles.badgeHint} numberOfLines={2}>{badge.hint}</Text> : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const highlightStyles = StyleSheet.create({
  homeRow: { flexDirection: "row", alignItems: "center", gap: S.md, minHeight: 60, padding: S.md, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  homeIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center" },
  homeLabel: { color: C.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  homeValue: { color: C.paper, fontSize: 15, fontWeight: "700", marginTop: 1 },
  homeAction: { color: C.volt, fontSize: 13.5, fontWeight: "700" },
  sub: { color: C.textDim, fontSize: 13, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, marginTop: S.md },
  badge: { width: "31%", flexGrow: 1, minHeight: 84, alignItems: "center", padding: S.sm, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: "rgba(227,239,38,0.35)" },
  badgeLocked: { borderColor: C.line, borderStyle: "dashed" },
  badgeIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.volt, alignItems: "center", justifyContent: "center" },
  badgeLabel: { color: C.paper, fontSize: 12.5, fontWeight: "700", marginTop: 6 },
  badgeHint: { color: C.textFaint, fontSize: 10.5, textAlign: "center", marginTop: 2, lineHeight: 13 },
});
