import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_FILTERS, PRICE_CAPS, SORTS, SURFACES } from "../utils/courts";
import { Button, C, Icon, R, S, styles } from "./shared";

function Chip({ label, active, onPress, icon }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, sheetStyles.chip, active && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={14} color={active ? C.ink : C.mist} style={{ marginRight: 5 }} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ToggleRow({ label, hint, value, onChange }) {
  return (
    <View style={sheetStyles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={sheetStyles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.profileHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: C.surface2, true: C.brand }} thumbColor={value ? C.volt : C.paper} accessibilityLabel={label} />
    </View>
  );
}

// Bottom sheet for sort + filters. Edits a draft and applies on "Show N
// courts", so the list doesn't jump around while you're choosing.
export function CourtFilterSheet({ visible, onClose, sort, filters, onApply, amenities, countFor, favoritesSupported, hasLocation }) {
  const [draftSort, setDraftSort] = useState(sort);
  const [draft, setDraft] = useState(filters);
  const [syncedFor, setSyncedFor] = useState(visible);
  // Reset the draft each time the sheet opens (derived-state pattern, no effect).
  if (visible !== syncedFor) {
    setSyncedFor(visible);
    if (visible) { setDraftSort(sort); setDraft(filters); }
  }
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleAmenity = (a) => set("amenities", draft.amenities.includes(a) ? draft.amenities.filter((x) => x !== a) : [...draft.amenities, a]);
  const count = countFor(draft);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters" />
        <SafeAreaView edges={["bottom"]} style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.title} accessibilityRole="header">Sort & filter</Text>
            <TouchableOpacity onPress={onClose} style={sheetStyles.closeBtn} accessibilityRole="button" accessibilityLabel="Close filters">
              <Icon name="close" size={20} color={C.paper} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: S.xl, paddingBottom: S.lg }} showsVerticalScrollIndicator={false}>
            <Text style={sheetStyles.section}>Sort by</Text>
            <View style={styles.choiceRow}>
              {SORTS.map((s) => <Chip key={s.key} label={s.label} icon={s.icon} active={draftSort === s.key} onPress={() => setDraftSort(s.key)} />)}
            </View>
            {draftSort === "nearest" && !hasLocation ? <Text style={styles.profileHint}>Uses your location. You&apos;ll be asked for permission.</Text> : null}

            <Text style={sheetStyles.section}>Surface</Text>
            <View style={styles.choiceRow}>
              <Chip label="Any" active={!draft.surface} onPress={() => set("surface", null)} />
              {SURFACES.map((s) => <Chip key={s} label={s} active={draft.surface === s} onPress={() => set("surface", s)} />)}
            </View>

            <Text style={sheetStyles.section}>Max price per hour</Text>
            <View style={styles.choiceRow}>
              {PRICE_CAPS.map((cap) => <Chip key={String(cap)} label={cap === null ? "Any" : `₱${cap}`} active={draft.maxPrice === cap} onPress={() => set("maxPrice", cap)} />)}
            </View>
            {draft.maxPrice !== null ? <Text style={styles.profileHint}>Courts without a listed price are hidden.</Text> : null}

            <View style={{ marginTop: S.lg, gap: S.xs }}>
              <ToggleRow label="Open now" hint="Based on each court's opening hours" value={draft.openNow} onChange={(v) => set("openNow", v)} />
              <ToggleRow label="Lit courts" hint="For evening games" value={draft.lighting} onChange={(v) => set("lighting", v)} />
              {favoritesSupported ? <ToggleRow label="Favorites only" value={draft.favoritesOnly} onChange={(v) => set("favoritesOnly", v)} /> : null}
            </View>

            {amenities.length ? (
              <>
                <Text style={sheetStyles.section}>Amenities</Text>
                <View style={styles.choiceRow}>
                  {amenities.map((a) => <Chip key={a} label={a} active={draft.amenities.includes(a)} onPress={() => toggleAmenity(a)} />)}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={sheetStyles.footer}>
            <Button variant="ghost" label="Reset" icon="refresh" onPress={() => { setDraftSort("rating"); setDraft(DEFAULT_FILTERS); }} style={{ flex: 1, minHeight: 48 }} accessibilityLabel="Reset sort and filters" />
            <Button
              label={count ? `Show ${count} court${count === 1 ? "" : "s"}` : "No matches"}
              onPress={() => { onApply(draftSort, draft); onClose(); }}
              disabled={!count}
              style={{ flex: 2, minHeight: 48 }}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "88%", backgroundColor: C.ink, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, borderWidth: 1, borderColor: C.lineStrong },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.lineStrong, marginTop: S.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: S.xl, paddingRight: S.sm, paddingTop: S.xs },
  title: { color: C.paper, fontSize: 19, fontWeight: "800" },
  closeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  section: { color: C.mist, fontSize: 13, fontWeight: "800", letterSpacing: 0.3, marginTop: S.lg, marginBottom: S.sm },
  chip: { marginRight: 0, minHeight: 40, flexDirection: "row", alignItems: "center" },
  toggleRow: { flexDirection: "row", alignItems: "center", minHeight: 52, gap: S.md },
  toggleLabel: { color: C.paper, fontSize: 15, fontWeight: "700" },
  footer: { flexDirection: "row", gap: S.sm, paddingHorizontal: S.xl, paddingTop: S.md, paddingBottom: S.md, borderTopWidth: 1, borderColor: C.line },
});
