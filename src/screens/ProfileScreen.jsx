import React, { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { profileFieldErrors, useDashboard } from "../context/DashboardContext";
import { useGameRecords } from "../context/GameRecordsContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { initialsFor, skillTier } from "../utils/format";
import { calculateProfileStats, matchHistoryFromRecords } from "../utils/profileStats";
import { uploadImageAsync } from "../utils/uploadImage";
import { useGoTab } from "./HomeScreen";
import { Avatar, Button, C, EmptyCard, ErrorNote, FieldError, Icon, IconBtn, R, S, ScreenFrame, SectionTitle, TabBackButton, profileName, styles } from "./shared";
import { notify } from "../utils/confirm";

const AVAILABILITY = ["Weekday mornings", "Weekday evenings", "Weekends"];

function ProfileTab({ onSignOut, profile, user, saveProfile, savingProfile, isAdmin, openAdmin, openHistory, availabilitySupported }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [skillLevel, setSkillLevel] = useState("3.0");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [preferredGameType, setPreferredGameType] = useState("Doubles");
  const [directoryVisible, setDirectoryVisible] = useState(true);
  const [availability, setAvailability] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { records: gameRecords, loading: gamesLoading, error: gamesError } = useGameRecords();

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      notify("Photo access needed", "Allow photo access in your device settings to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true, // uploadImageAsync reads the bytes from here (see utils/uploadImage)
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
    setAvailability(Array.isArray(profile?.availability) ? profile.availability : []);
    setShowErrors(false);
    setEditing(true);
  };

  const changes = { display_name: displayName, location, skill_level: skillLevel, avatar_url: avatarUrl, preferred_game_type: preferredGameType, is_directory_visible: directoryVisible, availability };
  // Errors show after the first save attempt, then update as the player types.
  const [showErrors, setShowErrors] = useState(false);
  const errors = showErrors ? profileFieldErrors(changes) : {};

  const save = async () => {
    setSaveSuccess(false);
    if (Object.keys(profileFieldErrors(changes)).length) { setShowErrors(true); return; }
    const result = await saveProfile(changes);
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
    { label: "Record (W–L)", value: noGames ? "—" : `${profileStats.wins}–${profileStats.losses}` },
    { label: "Streak", value: profileStats.streak ? `${profileStats.streak.result === "win" ? "W" : "L"}${profileStats.streak.count}` : "—", hot: profileStats.streak?.result === "win" && profileStats.streak.count >= 3 },
    { label: "Win rate", value: noGames ? "—" : profileStats.winRate === null ? "—" : `${profileStats.winRate}%` },
  ];
  // Most recent 8 results, oldest on the left so the row reads like a timeline.
  const recent = gameRecords.slice(0, 8).reverse();
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
          <Text style={styles.profileFieldLabel}>Display name</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Display name" placeholderTextColor={C.textFaint} style={[styles.profileInput, errors.display_name && styles.inputError]} accessibilityLabel="Display name" accessibilityHint={errors.display_name} />
          <FieldError message={errors.display_name} />
          <Text style={styles.profileFieldLabel}>Location</Text>
          <TextInput value={location} onChangeText={setLocation} placeholder="Location" placeholderTextColor={C.textFaint} style={[styles.profileInput, errors.location && styles.inputError]} accessibilityLabel="Location" accessibilityHint={errors.location} />
          <FieldError message={errors.location} />
          <Text style={styles.profileFieldLabel}>Skill level</Text>
          <TextInput value={skillLevel} onChangeText={setSkillLevel} keyboardType="decimal-pad" placeholder="e.g. 3.5" placeholderTextColor={C.textFaint} style={[styles.profileInput, errors.skill_level && styles.inputError]} accessibilityLabel="Skill level" accessibilityHint={errors.skill_level} />
          <FieldError message={errors.skill_level} />
          <Text style={styles.profileFieldLabel}>Preferred game type</Text>
          <View style={styles.choiceRow}>
            {["Singles", "Doubles", "Either"].map((type) => chip(type, preferredGameType, setPreferredGameType))}
          </View>
          {availabilitySupported ? (
            <>
              <Text style={styles.profileFieldLabel}>When do you usually play?</Text>
              <View style={styles.choiceRow}>
                {AVAILABILITY.map((time) => {
                  const active = availability.includes(time);
                  return (
                    <TouchableOpacity key={time} onPress={() => setAvailability((current) => (active ? current.filter((t) => t !== time) : [...current, time]))} style={[styles.chip, { marginRight: 0, minHeight: 44, justifyContent: "center" }, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.profileHint}>Helps other players find you in Find Players.</Text>
            </>
          ) : null}
          <View style={[styles.visibilityRow, { marginTop: S.sm }]}>
            <View style={{ flex: 1 }}><Text style={styles.profileFieldLabel}>Show me in the player directory</Text><Text style={styles.profileHint}>Other signed-in players can find your profile.</Text></View>
            <Switch value={directoryVisible} onValueChange={setDirectoryVisible} trackColor={{ false: C.surface2, true: C.brand }} thumbColor={directoryVisible ? C.volt : C.paper} accessibilityLabel="Show me in the player directory" />
          </View>
          <Button label="Save profile" icon="checkmark" onPress={save} loading={savingProfile} style={{ marginTop: S.sm }} />
        </View> : <>
          <Text style={styles.profileSub}>{profile?.location || "Tagum City"} · Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "today"}</Text>
          <View style={styles.skillBadge}>
            <Icon name="trophy" size={14} color={C.volt} />
            <Text style={styles.skillBadgeText}>{Number(profile?.skill_level || 3).toFixed(1)} · {skillTier(profile?.skill_level)}</Text>
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
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {s.hot ? <Icon name="flame" size={16} color={C.volt} style={{ marginRight: 2 }} /> : null}
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <SectionTitle>Skill tracker</SectionTitle>
        <Text style={styles.trendText}>{gamesLoading ? "Loading match results…" : gameRecords.length ? `${profileStats.wins} win${profileStats.wins === 1 ? "" : "s"} from ${profileStats.matchesPlayed} recorded match${profileStats.matchesPlayed === 1 ? "" : "es"} · ${profileStats.pointsFor} points scored` : "Record matches to see your progress."}</Text>
        {recent.length ? (
          <View style={trackerStyles.card}>
            {/* Win share across all recorded matches. */}
            <View style={trackerStyles.splitBar} accessibilityLabel={`${profileStats.wins} wins, ${profileStats.losses} losses`}>
              {profileStats.wins ? <View style={[trackerStyles.splitWin, { flex: profileStats.wins }]} /> : null}
              {profileStats.losses ? <View style={[trackerStyles.splitLoss, { flex: profileStats.losses }]} /> : null}
            </View>
            <View style={trackerStyles.splitLegend}>
              <Text style={[trackerStyles.legendText, { color: C.volt }]}>{profileStats.wins} W</Text>
              <Text style={trackerStyles.legendText}>{profileStats.losses} L</Text>
            </View>
            <Text style={trackerStyles.recentLabel}>Last {recent.length} match{recent.length === 1 ? "" : "es"} · oldest → newest</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {recent.map((game) => {
                const win = game.result === "win";
                return (
                  <View key={game.id} style={[trackerStyles.result, win && trackerStyles.resultWin]} accessibilityLabel={`${win ? "Win" : "Loss"} ${game.player_score} to ${game.opponent_score} against ${game.opponents}`}>
                    <Text style={[trackerStyles.resultLetter, { color: win ? C.ink : C.paper }]}>{win ? "W" : "L"}</Text>
                    <Text style={[trackerStyles.resultScore, { color: win ? C.ink : C.textDim }]}>{game.player_score}–{game.opponent_score}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <View style={[trackerStyles.card, { alignItems: "center", paddingVertical: S.xl }]}>
            <Icon name="bar-chart-outline" size={22} color={C.textFaint} />
            <Text style={[styles.trendText, { marginTop: 6 }]}>{gamesLoading ? "Loading…" : "No match results yet"}</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <TouchableOpacity onPress={openHistory} style={trackerStyles.historyLink} accessibilityRole="button" accessibilityLabel="Matches and bookings. Record matches and manage reservations">
          <View style={styles.infoIcon}><Icon name="time" size={16} color={C.volt} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminActionTitle}>Matches & bookings</Text>
            <Text style={styles.adminActionHint}>Record matches, confirm scores, manage reservations</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={C.textDim} />
        </TouchableOpacity>
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
  const { profile, saveProfile, savingProfile, availabilitySupported } = useDashboard();
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
        availabilitySupported={availabilitySupported}
      />
    </ScreenFrame>
  );
}

const trackerStyles = StyleSheet.create({
  historyLink: { flexDirection: "row", alignItems: "center", gap: S.sm, minHeight: 64, backgroundColor: C.surface, borderWidth: 1, borderColor: "rgba(227,239,38,0.3)", borderRadius: R.lg, paddingHorizontal: S.md },
  card: { marginTop: S.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: S.lg },
  splitBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: C.surface2 },
  splitWin: { backgroundColor: C.volt },
  splitLoss: { backgroundColor: "rgba(255,253,238,0.22)" },
  splitLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  legendText: { color: C.textDim, fontSize: 12, fontWeight: "800" },
  recentLabel: { color: C.textDim, fontSize: 12, fontWeight: "700", marginTop: S.lg, marginBottom: S.sm },
  result: { minWidth: 56, alignItems: "center", paddingVertical: S.sm, paddingHorizontal: S.sm, borderRadius: R.sm, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  resultWin: { backgroundColor: C.volt, borderColor: C.volt },
  resultLetter: { fontSize: 14, fontWeight: "800" },
  resultScore: { fontSize: 12, fontWeight: "700", marginTop: 2 },
});
