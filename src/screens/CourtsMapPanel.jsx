import React, { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import CourtsMap from "../components/CourtsMap";
import { PIN_COLORS } from "../components/leafletMapHtml";
import { hasCoordinates, openDirections } from "../utils/directions";
import { ratingLabel } from "../utils/courts";
import { Button, C, CourtArt, Icon, R, S, Skeleton, StatusPill } from "./shared";

const LEGEND = [["Available", PIN_COLORS.Available], ["Full", PIN_COLORS.Full], ["Closed", PIN_COLORS.Closed]];

// 44×44 round control floating over the map.
function MapButton({ icon, onPress, label, busy }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} style={panelStyles.mapButton} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {busy ? <ActivityIndicator size="small" color={C.volt} /> : <Icon name={icon} size={20} color={C.paper} />}
    </TouchableOpacity>
  );
}

// Shown when a pin is tapped: enough to decide, one tap to go deeper.
export function CourtMiniCard({ court, onOpen, onClose }) {
  const photo = court.photoUrls?.[0];
  const showDistance = court.dist && court.dist !== "Distance unavailable";
  // The card is a plain container: the photo + name area, close and the
  // action buttons are sibling pressables (nesting them is invalid on web
  // and confusing for screen readers).
  return (
    <View style={panelStyles.miniCard}>
      <View style={{ flexDirection: "row" }}>
        <Pressable
          onPress={onOpen}
          style={({ pressed }) => [{ flex: 1, flexDirection: "row" }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={`${court.name}, ${court.status}, ${ratingLabel(court) === "New" ? "not rated yet" : `rated ${ratingLabel(court)}`}${showDistance ? `, ${court.dist} away` : ""}. Opens court details.`}
        >
        <View style={panelStyles.miniThumb}>
          {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} /> : <CourtArt compact />}
        </View>
        <View style={{ flex: 1, marginLeft: S.md }}>
          <Text style={panelStyles.miniName} numberOfLines={1}>{court.name}</Text>
          <View style={panelStyles.miniMetaRow}>
            <Icon name="star" size={12} color={C.volt} />
            <Text style={panelStyles.miniMeta}>{ratingLabel(court)}</Text>
            {showDistance ? <><Text style={panelStyles.miniDot}>·</Text><Icon name="navigate" size={11} color={C.textDim} /><Text style={panelStyles.miniMeta}>{court.dist}</Text></> : null}
            {court.hourlyRate !== null && court.hourlyRate !== undefined ? <><Text style={panelStyles.miniDot}>·</Text><Text style={panelStyles.miniMeta}>₱{Math.round(court.hourlyRate)}/hr</Text></> : null}
          </View>
          <View style={{ flexDirection: "row", marginTop: 6 }}><StatusPill status={court.status} /></View>
        </View>
        </Pressable>
        <TouchableOpacity onPress={onClose} style={panelStyles.miniClose} accessibilityRole="button" accessibilityLabel="Close court preview" hitSlop={4}>
          <Icon name="close" size={18} color={C.textDim} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.md }}>
        {hasCoordinates(court) ? (
          <Button variant="ghost" icon="navigate-outline" label="Directions" onPress={() => openDirections(court)} style={{ flex: 1, minHeight: 44 }} accessibilityLabel={`Directions to ${court.name}`} />
        ) : null}
        <Button
          icon="calendar-outline"
          label={court.status === "Available" ? "Book" : "View"}
          onPress={onOpen}
          style={{ flex: 1, minHeight: 44 }}
          accessibilityLabel={court.status === "Available" ? `Book a slot at ${court.name}` : `View ${court.name}`}
        />
      </View>
    </View>
  );
}

// The courts map plus its native controls. `variant` "preview" sits inside the
// list; "full" fills the screen in Map mode.
export function CourtsMapPanel({ courts, userLocation, locating, onLocate, onOpenCourt, variant = "preview", onExpand, onCollapse, onSearchArea, areaActive, onClearArea, loading }) {
  const [selectedId, setSelectedId] = useState(null);
  const [movedBounds, setMovedBounds] = useState(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const selected = useMemo(() => courts.find((c) => c.id === selectedId) || null, [courts, selectedId]);
  const full = variant === "full";

  const locate = () => {
    setRecenterKey((k) => k + 1);
    onLocate?.();
  };

  const searchArea = () => {
    onSearchArea?.(movedBounds);
    setMovedBounds(null);
  };

  return (
    <View style={full ? panelStyles.full : panelStyles.preview}>
      <CourtsMap
        courts={courts}
        selectedId={selected ? selectedId : null}
        userLocation={userLocation}
        recenterKey={recenterKey}
        onCourtPress={setSelectedId}
        onMapPress={() => setSelectedId(null)}
        onRegionChange={onSearchArea ? setMovedBounds : undefined}
        onReady={() => setMapReady(true)}
      />

      {!mapReady || loading ? (
        <View style={panelStyles.loading} pointerEvents="none">
          <Skeleton width="100%" height="100%" radius={0} style={StyleSheet.absoluteFillObject} />
          <ActivityIndicator color={C.volt} />
          <Text style={panelStyles.loadingText}>Loading map…</Text>
        </View>
      ) : null}

      {!selected ? <View style={panelStyles.legend} pointerEvents="none" accessibilityLabel="Map legend: green available, red full, gray closed">
        {LEGEND.map(([label, color]) => (
          <View key={label} style={panelStyles.legendItem}>
            <View style={[panelStyles.legendDot, { backgroundColor: color }]} />
            <Text style={panelStyles.legendText}>{label}</Text>
          </View>
        ))}
      </View> : null}

      <View style={panelStyles.controls}>
        {full
          ? <MapButton icon="contract-outline" label="Back to list" onPress={onCollapse} />
          : <MapButton icon="expand-outline" label="Expand map to full screen" onPress={onExpand} />}
        <MapButton icon="locate" label="Center on my location" onPress={locate} busy={locating} />
      </View>

      {movedBounds ? (
        <View style={panelStyles.topCenter} pointerEvents="box-none">
          <TouchableOpacity onPress={searchArea} style={panelStyles.searchArea} accessibilityRole="button" accessibilityLabel="Search this area">
            <Icon name="search" size={14} color={C.ink} />
            <Text style={panelStyles.searchAreaText}>Search this area</Text>
          </TouchableOpacity>
        </View>
      ) : areaActive ? (
        <View style={panelStyles.topCenter} pointerEvents="box-none">
          <TouchableOpacity onPress={onClearArea} style={[panelStyles.searchArea, { backgroundColor: C.surface2 }]} accessibilityRole="button" accessibilityLabel="Show courts in all areas">
            <Icon name="close" size={14} color={C.paper} />
            <Text style={[panelStyles.searchAreaText, { color: C.paper }]}>Showing this area</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {selected ? (
        <View style={panelStyles.bottom} pointerEvents="box-none">
          <CourtMiniCard court={selected} onOpen={() => onOpenCourt(selected)} onClose={() => setSelectedId(null)} />
        </View>
      ) : null}
    </View>
  );
}

const panelStyles = StyleSheet.create({
  preview: { height: 320, marginHorizontal: S.xl, marginTop: S.md, borderRadius: R.lg, overflow: "hidden", borderWidth: 1, borderColor: C.line, backgroundColor: "#0B1F1A" },
  full: { flex: 1, overflow: "hidden", backgroundColor: "#0B1F1A" },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  loadingText: { color: C.textDim, fontSize: 12.5, marginTop: S.sm },
  legend: { position: "absolute", left: S.sm, bottom: S.sm, flexDirection: "row", gap: 8, backgroundColor: "rgba(6,35,29,0.82)", borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: C.mist, fontSize: 11, fontWeight: "700" },
  controls: { position: "absolute", top: S.sm, right: S.sm, gap: S.sm },
  mapButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(6,35,29,0.9)", borderWidth: 1, borderColor: C.lineStrong, alignItems: "center", justifyContent: "center" },
  topCenter: { position: "absolute", top: S.sm, left: 0, right: 0, alignItems: "center" },
  searchArea: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: S.lg, borderRadius: R.pill, backgroundColor: C.volt, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  searchAreaText: { color: C.ink, fontSize: 13, fontWeight: "800" },
  bottom: { position: "absolute", left: S.sm, right: S.sm, bottom: S.sm },
  miniCard: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.lineStrong, padding: S.md, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  miniThumb: { width: 72, height: 72, borderRadius: R.sm, overflow: "hidden", backgroundColor: C.brand },
  miniName: { color: C.paper, fontSize: 16, fontWeight: "800", paddingRight: S.sm },
  miniMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 3, flexWrap: "wrap" },
  miniMeta: { color: C.mist, fontSize: 12.5, fontWeight: "600" },
  miniDot: { color: C.textFaint, marginHorizontal: 3 },
  miniClose: { width: 44, height: 44, marginTop: -S.sm, marginRight: -S.sm, alignItems: "center", justifyContent: "center" },
});
