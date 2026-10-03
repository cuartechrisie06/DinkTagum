import React, { useState } from "react";
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useGameRecords } from "../context/GameRecordsContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor } from "../utils/format";
import { calculateProfileStats, matchHistoryFromRecords } from "../utils/profileStats";
import { uploadImageAsync } from "../utils/uploadImage";
import { useGoTab } from "./HomeScreen";
import { Avatar, Button, C, EmptyCard, ErrorNote, Icon, IconBtn, S, ScreenFrame, SectionTitle, TabBackButton, profileName, styles } from "./shared";
import { notify } from "../utils/confirm";

function ProfileTab({ onSignOut, profile, user, saveProfile, savingProfile, isAdmin, openAdmin, openHistory }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [skillLevel, setSkillLevel] = useState("3.0");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [preferredGameType, setPreferredGameType] = useState("Doubles");
  const [directoryVisible, setDirectoryVisible] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { records: gameRecords, loading: gamesLoading, error: gamesError } = useGameRecords();

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Photo access needed", "Allow photo access in your device settings to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    setUploadingAvatar(true);
    const { url, error } = await uploadImageAsync("avatars", user.id, result.assets[0]);
    setUploadingAvatar(false);
    if (error) { notify("Upload failed", error.message); return; }
    setAvatarUrl(url);
  };

  const startEditing = () => {
    setDisplayName(profileName(profile, user));
    setLocation(profile?.location || "Tagum City");
    setSkillLevel(String(profile?.skill_level || "3.0"));
    setAvatarUrl(profile?.avatar_url || "");
    setPreferredGameType(profile?.preferred_game_type || "Doubles");
    setDirectoryVisible(profile?.is_directory_visible !== false);
    setEditing(true);
  };

  const save = async () => {
    setSaveSuccess(false);
    const result = await saveProfile({ display_name: displayName, location, skill_level: skillLevel, avatar_url: avatarUrl, preferred_game_type: preferredGameType, is_directory_visible: directoryVisible });
    if (result) {
      setEditing(false);
      setSaveSuccess(true);
      // Auto-clear success notice after 4 seconds.
      setTimeout(() => setSaveSuccess(false), 4000);
    }
  };
  const profileStats = calculateProfileStats(gameRecords);
  const noGames = profileStats.matchesPlayed === 0;
  const stats = [
    { label: "Matches", value: noGames ? "—" : String(profileStats.matchesPlayed) },
    { label: "W/L ratio", value: noGames ? "—" : profileStats.winLossRatio },
    { label: "Points", value: noGames ? "—" : String(profileStats.pointsFor) },
    { label: "Win rate", value: noGames ? "—" : profileStats.winRate === null ? "—" : `${profileStats.winRate}%` },
  ];
  // Most recent 6 games (records are already sorted descending by played_on).
  const history = gameRecords.slice(0, 6).map((game) => ({
    h: Math.max(8, Math.round((game.player_score / Math.max(game.player_score, game.opponent_score, 11)) * 100)),
    label: game.result === "win" ? "W" : "L",
  }));
  const matches = matchHistoryFromRecords(gameRecords);

  const chip = (value, current, set) => (
    <TouchableOpacity key={value} onPress={() => set(value)} style={[styles.chip, { marginRight: 0 }, current === value && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: current === value }}>
      <Text style={[styles.chipText, current === value && styles.chipTextActive]}>{value}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: S.md }}>
          <TabBackButton />
          <Text style={styles.headerTitle} accessibilityRole="header">Profile</Text>
        </View>
        <View style={{ flexDirection: "row", gap: S.sm }}>
          {isAdmin ? <IconBtn name="shield-checkmark-outline" variant="ghost" onPress={openAdmin} accessibilityLabel="Open admin interface" /> : null}
          <IconBtn name={editing ? "close" : "create-outline"} variant={editing ? "ghost" : "solid"} onPress={() => (editing ? setEditing(false) : startEditing())} accessibilityLabel={editing ? "Close profile editor" : "Edit profile"} />
        </View>
      </View>

      <View style={[styles.profileHero, { marginTop: S.lg }]}>
        <Avatar initials={initialsFor(profileName(profile, user))} uri={profile?.avatar_url} size={92} ring />
        <Text style={styles.profileName}>{profileName(profile, user)}</Text>
        {editing ? <View style={styles.profileForm}>
          <Text style={styles.profileFieldLabel}>Photo</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
            <Avatar initials={initialsFor(displayName)} uri={avatarUrl} size={44} />
            <Button variant="ghost" icon="camera-outline" label={avatarUrl ? "Change photo" : "Upload photo"} onPress={pickAvatar} loading={uploadingAvatar} style={{ flex: 1 }} accessibilityLabel="Upload profile photo" />
          </View>
          <TextInput value={avatarUrl} onChangeText={setAvatarUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="Or paste an image URL" placeholderTextColor={C.textFaint} style={styles.profileInput} accessibilityLabel="Avatar image URL" />
          <Text style={styles.profileFieldLabel}>Display name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={C.textFaint} style={styles.profileInput} accessibilityLabel="Display name" />
          <Text style={styles.profileFieldLabel}>Location</Text>
          <TextInput value={location} onChangeText={setLocation} placeholder="Location" placeholderTextColor={C.textFaint} style={styles.profileInput} accessibilityLabel="Location" />
          <Text style={styles.profileFieldLabel}>Skill level</Text>
          <TextInput value={skillLevel} onChangeText={setSkillLevel} keyboardType="decimal-pad" placeholder="e.g. 3.5" placeholderTextColor={C.textFaint} style={styles.profileInput} accessibilityLabel="Skill level" />
          <Text style={styles.profileFieldLabel}>Preferred game type</Text>
          <View style={styles.choiceRow}>
            {["Singles", "Doubles", "Either"].map((type) => chip(type, preferredGameType, setPreferredGameType))}
          </View>
          <View style={[styles.visibilityRow, { marginTop: S.sm }]}>
            <View style={{ flex: 1 }}><Text style={styles.profileFieldLabel}>Show me in the player directory</Text><Text style={styles.profileHint}>Other signed-in players can find your profile.</Text></View>
            <Switch value={directoryVisible} onValueChange={setDirectoryVisible} trackColor={{ false: C.surface2, true: C.brand }} thumbColor={directoryVisible ? C.volt : C.paper} accessibilityLabel="Show me in the player directory" />
          </View>
          <Button label="Save profile" icon="checkmark" onPress={save} loading={savingProfile} style={{ marginTop: S.sm }} />
        </View> : <>
          <Text style={styles.profileSub}>{profile?.location || "Tagum City"} · Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "today"}</Text>
          <View style={styles.skillBadge}>
            <Icon name="trophy" size={14} color={C.volt} />
            <Text style={styles.skillBadgeText}>{profile?.skill_level || "3.0"} · {Number(profile?.skill_level || 3) >= 3.5 ? "Intermediate" : "Developing"}</Text>
          </View>
        </>}
      </View>

      <View style={styles.statsGrid}>
        {/* Inline save-success notice — shown briefly after a profile update. */}
        {saveSuccess ? (
          <View style={{ position: "absolute", top: -S.xl, left: S.xl, right: S.xl, flexDirection: "row", alignItems: "center", backgroundColor: C.voltSoft, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.sm, borderWidth: 1, borderColor: C.volt }}>
            <Icon name="checkmark-circle" size={16} color={C.volt} />
            <Text style={{ color: C.volt, fontSize: 13, fontWeight: "700", marginLeft: S.sm }}>Profile saved successfully</Text>
          </View>
        ) : null}
        {stats.map((s) => (
          <View key={s.label} style={styles.statCard}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <SectionTitle>Skill tracker</SectionTitle>
        <Text style={styles.trendText}>{gamesLoading ? "Loading match results…" : gameRecords.length ? `${profileStats.wins} win${profileStats.wins === 1 ? "" : "s"} from ${profileStats.matchesPlayed} recorded match${profileStats.matchesPlayed === 1 ? "" : "es"}` : "Record matches to see your progress."}</Text>
        <View style={styles.chart}>
          {history.length ? history.map((h, i) => (
            <View key={i} style={styles.chartCol}>
              <View style={{ flex: 1, justifyContent: "flex-end", width: "70%" }}>
                <View style={{ height: `${Math.min(100, h.h)}%`, borderRadius: 6, backgroundColor: h.label === "W" ? C.volt : "rgba(255,253,238,0.2)" }} />
              </View>
              <Text style={[styles.chartLabel, { color: h.label === "W" ? C.volt : C.textDim }]}>{h.label}</Text>
            </View>
          )) : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Icon name="bar-chart-outline" size={22} color={C.textFaint} /><Text style={[styles.trendText, { marginTop: 6 }]}>No match results yet</Text></View>}
        </View>
      </View>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <SectionTitle action="Manage" onAction={openHistory}>Recent matches</SectionTitle>
        <View style={{ marginTop: S.md }}>
          {matches.map((match) => {
            const win = match.result === "win";
            return (
              <View key={match.id} style={styles.matchRow}>
                <View style={[styles.matchResult, { backgroundColor: win ? C.voltSoft : "rgba(255,253,238,0.08)" }]}>
                  <Text style={{ color: win ? C.volt : C.textDim, fontWeight: "800", fontSize: 13 }}>{win ? "W" : "L"}</Text>
                </View>
                <Text style={[styles.matchVs, { flex: 1 }]} numberOfLines={1}>vs. {match.opponent}</Text>
                <Text style={[styles.matchScore, { color: win ? C.volt : C.textDim }]}>{match.playerScore}–{match.opponentScore}</Text>
              </View>
            );
          })}
          {!gamesLoading && !matches.length ? <EmptyCard icon="tennisball-outline" title="No matches yet" message="Record your games from the History tab." /> : null}
        </View>
      </View>
      <ErrorNote>{gamesError}</ErrorNote>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <Button variant="ghost" icon="log-out-outline" label="Sign out" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

export function ProfileScreen() {
  const { session, isAdmin, signOut } = useAuth();
  const { profile, saveProfile, savingProfile } = useDashboard();
  const { setAdminView } = useOverlayNav();
  const goTab = useGoTab();
  return (
    <ScreenFrame>
      <ProfileTab
        onSignOut={signOut}
        profile={profile}
        user={session.user}
        saveProfile={saveProfile}
        savingProfile={savingProfile}
        isAdmin={isAdmin}
        openAdmin={() => setAdminView(true)}
        openHistory={() => goTab("history")}
      />
    </ScreenFrame>
  );
}
