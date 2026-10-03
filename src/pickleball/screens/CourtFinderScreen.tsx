import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { MOCK_COURTS, type MockCourt, type CourtStatus, type CourtSurface, type CourtPricing } from "../../../data/courts";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Chip } from "../components/Chip";
import { StatusBadge } from "../components/StatusBadge";
import {
  Colors,
  FontSize,
  FontWeight,
  MIN_TOUCH,
  Radius,
  Spacing,
  cardShadow,
} from "../theme";

// ─── Filter state types ────────────────────────────────────────────────────────

type SurfaceFilter = CourtSurface | "All";
type PricingFilter = CourtPricing | "All";
type LitFilter = "All" | "Lit";
type StatusFilter = CourtStatus | "All";
type ViewMode = "list" | "map";

// ─── Small reusable sub-components ────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={s.searchRow}>
      <Ionicons
        name="search-outline"
        size={18}
        color={Colors.textMuted}
        style={s.searchIcon}
      />
      <TextInput
        style={s.searchInput}
        placeholder="Search courts, areas…"
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search courts"
        accessibilityRole="search"
      />
    </View>
  );
}

function ViewToggle({
  mode,
  onToggle,
}: {
  mode: ViewMode;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={s.toggleBtn}
      accessibilityRole="button"
      accessibilityLabel={mode === "list" ? "Switch to map view" : "Switch to list view"}
      hitSlop={8}
    >
      <Ionicons
        name={mode === "list" ? "map-outline" : "list-outline"}
        size={20}
        color={Colors.navy}
      />
    </TouchableOpacity>
  );
}

function MapPlaceholder({ courtCount }: { courtCount: number }) {
  return (
    <View style={s.mapPlaceholder} accessibilityLabel="Map view placeholder">
      <Ionicons name="map" size={48} color={Colors.lime} />
      <Text style={s.mapPlaceholderTitle}>Map View</Text>
      <Text style={s.mapPlaceholderSub}>
        {courtCount} court{courtCount !== 1 ? "s" : ""} in this area
      </Text>
      <Text style={s.mapPlaceholderHint}>
        Full map integration coming soon.{"\n"}Use List view to browse courts.
      </Text>
    </View>
  );
}

// ─── Court card ────────────────────────────────────────────────────────────────

interface CourtCardProps {
  court: MockCourt;
  onPress: (court: MockCourt) => void;
}

function CourtCard({ court, onPress }: CourtCardProps) {
  const rateLabel = court.hourlyRate
    ? `₱${court.hourlyRate}/hr`
    : "Free";

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(court)}
      accessibilityRole="button"
      accessibilityLabel={`${court.name}, ${court.distanceKm} km away, ${court.status}`}
      style={s.cardWrapper}
    >
      <Card style={s.card}>
        {/* Thumbnail */}
        <View style={s.thumbContainer}>
          <Image
            source={{ uri: court.imageUrl }}
            style={s.thumb}
            accessibilityLabel={`${court.name} photo`}
            resizeMode="cover"
          />
          {/* Distance badge — top-left */}
          <View style={s.distanceBadge}>
            <Ionicons name="navigate" size={10} color={Colors.navy} />
            <Text style={s.distanceBadgeText}>{court.distanceKm} km</Text>
          </View>
          {/* Status badge — top-right */}
          <View style={s.thumbBadge}>
            <StatusBadge status={court.status} />
          </View>
        </View>

        {/* Body */}
        <View style={s.cardBody}>
          {/* Name + rating row */}
          <View style={s.cardTitleRow}>
            <Text style={s.cardName} numberOfLines={1}>
              {court.name}
            </Text>
            <View style={s.ratingPill}>
              <Ionicons name="star" size={11} color={Colors.navy} />
              <Text style={s.ratingText}>{court.rating.toFixed(1)}</Text>
            </View>
          </View>

          {/* Address */}
          <View style={s.addressRow}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
            <Text style={s.addressText} numberOfLines={1}>
              {court.address}
            </Text>
          </View>

          {/* Meta row: surface · pricing · courts count */}
          <View style={s.metaRow}>
            <MetaPill icon="grid-outline" label={`${court.courts} court${court.courts > 1 ? "s" : ""}`} />
            <MetaPill icon={court.surface === "Indoor" ? "home-outline" : "sunny-outline"} label={court.surface} />
            <MetaPill icon="time-outline" label={rateLabel} />
            {court.isLit && <MetaPill icon="flashlight-outline" label="Lit" />}
          </View>

          {/* CTA */}
          <Button
            label="View Court"
            onPress={() => onPress(court)}
            style={s.cardCta}
          />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function MetaPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.metaPill}>
      <Ionicons name={icon as any} size={11} color={Colors.textSecondary} />
      <Text style={s.metaPillText}>{label}</Text>
    </View>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <View style={s.empty}>
      <Ionicons name="tennisball-outline" size={52} color={Colors.grayDark} />
      <Text style={s.emptyTitle}>No courts found</Text>
      <Text style={s.emptySub}>Try adjusting your filters or search term.</Text>
      <Button label="Clear filters" onPress={onReset} variant="ghost" style={{ marginTop: Spacing.lg }} />
    </View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export function CourtFinderScreen() {
  const [query, setQuery] = useState("");
  const [surface, setSurface] = useState<SurfaceFilter>("All");
  const [pricing, setPricing] = useState<PricingFilter>("All");
  const [lit, setLit] = useState<LitFilter>("All");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_COURTS.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.address.toLowerCase().includes(q)) return false;
      if (surface !== "All" && c.surface !== surface) return false;
      if (pricing !== "All" && c.pricing !== pricing) return false;
      if (lit === "Lit" && !c.isLit) return false;
      if (status !== "All" && c.status !== status) return false;
      return true;
    });
  }, [query, surface, pricing, lit, status]);

  const resetFilters = () => {
    setQuery("");
    setSurface("All");
    setPricing("All");
    setLit("All");
    setStatus("All");
  };

  const handleCourtPress = (_court: MockCourt) => {
    // TODO: navigate to court detail screen
  };

  const renderItem = ({ item }: ListRenderItemInfo<MockCourt>) => (
    <CourtCard court={item} onPress={handleCourtPress} />
  );

  const header = (
    <>
      {/* ── Top bar ── */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <Text style={s.screenTitle}>Court Finder</Text>
          <Text style={s.screenSub}>Tagum City, Davao del Norte</Text>
        </View>
        <ViewToggle mode={viewMode} onToggle={() => setViewMode((m) => (m === "list" ? "map" : "list"))} />
      </View>

      {/* ── Search bar ── */}
      <View style={s.searchContainer}>
        <SearchBar value={query} onChange={setQuery} />
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
        accessibilityRole="tablist"
        accessibilityLabel="Filter courts"
      >
        {/* Surface */}
        <Chip label="Indoor" active={surface === "Indoor"} onPress={() => setSurface((v) => v === "Indoor" ? "All" : "Indoor")} />
        <Chip label="Outdoor" active={surface === "Outdoor"} onPress={() => setSurface((v) => v === "Outdoor" ? "All" : "Outdoor")} />
        {/* Pricing */}
        <Chip label="Free" active={pricing === "Free"} onPress={() => setPricing((v) => v === "Free" ? "All" : "Free")} />
        <Chip label="Paid" active={pricing === "Paid"} onPress={() => setPricing((v) => v === "Paid" ? "All" : "Paid")} />
        {/* Lit */}
        <Chip label="Lit" active={lit === "Lit"} onPress={() => setLit((v) => v === "Lit" ? "All" : "Lit")} />
        {/* Status */}
        <Chip label="Open now" active={status === "Open"} onPress={() => setStatus((v) => v === "Open" ? "All" : "Open")} />
      </ScrollView>

      {/* ── Result count ── */}
      <View style={s.resultRow}>
        <Text style={s.resultCount}>
          {filtered.length} court{filtered.length !== 1 ? "s" : ""}
        </Text>
        {(surface !== "All" || pricing !== "All" || lit !== "All" || status !== "All" || query) ? (
          <TouchableOpacity onPress={resetFilters} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all filters">
            <Text style={s.clearAll}>Clear all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );

  if (viewMode === "map") {
    return (
      <SafeAreaView style={s.safeArea} edges={["top"]}>
        {header}
        <MapPlaceholder courtCount={filtered.length} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea} edges={["top"]}>
      <FlatList<MockCourt>
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState onReset={resetFilters} />}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.gray,
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.navy,
  },
  topBarLeft: {
    flex: 1,
  },
  screenTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    letterSpacing: -0.5,
  },
  screenSub: {
    fontSize: FontSize.sm,
    color: Colors.lime,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  toggleBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: Radius.md,
    backgroundColor: Colors.limeSoft,
    alignItems: "center",
    justifyContent: "center",
    // Override limeSoft with white at partial opacity for contrast on navy
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: 4,
  },

  // Search
  searchContainer: {
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    height: 46,
    ...cardShadow,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },

  // Chips
  chipsRow: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: 0, // gap handled by Chip's marginRight
  },

  // Result row
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  resultCount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  clearAll: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.navyMuted,
    textDecorationLine: "underline",
  },

  // List
  listContent: {
    paddingBottom: Spacing.xxxl,
  },

  // Court card
  cardWrapper: {
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  card: {
    // Card already has white bg + shadow from Card component
  },
  thumbContainer: {
    position: "relative",
    height: 168,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  distanceBadge: {
    position: "absolute",
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  distanceBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.navy,
  },
  thumbBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
  },
  cardBody: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  cardName: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.lime,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  ratingText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.navy,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addressText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: 2,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.gray,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  metaPillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  cardCta: {
    marginTop: Spacing.xs,
  },

  // Map placeholder
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxxl,
    gap: Spacing.sm,
  },
  mapPlaceholderTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  mapPlaceholderSub: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.navy,
  },
  mapPlaceholderHint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: Spacing.xs,
  },

  // Empty state
  empty: {
    alignItems: "center",
    padding: Spacing.xxxl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  emptySub: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: "center",
  },
});
