import React, { useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { insideBounds } from "../components/leafletMapHtml";
import { useDashboard } from "../context/DashboardContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { activeFilterCount, amenityOptions, DEFAULT_FILTERS, filterCourts, SORTS, sortCourts } from "../utils/courts";
import { CourtFilterSheet } from "./CourtFilterSheet";
import { CourtsMapPanel } from "./CourtsMapPanel";
import { Button, C, ChipScroller, CourtCard, CourtCardSkeleton, EmptyCard, ErrorNote, HeaderBar, Icon, R, S, ScreenFrame, styles } from "./shared";

const STATUSES = ["All", "Available", "Full", "Closed"];
const BAR = { id: "__find-bar", bar: true };
const EMPTY = { id: "__empty", empty: true };
const SKELETON_ITEMS = Array.from({ length: 3 }, (_, index) => ({ id: `skeleton-${index}`, skeleton: true }));

function ModeToggle({ mode, setMode }) {
  return (
    <View style={courtStyles.segment} accessibilityRole="tablist">
      {[["list", "List", "list"], ["map", "Map", "map"]].map(([key, label, icon]) => {
        const active = mode === key;
        return (
          <TouchableOpacity key={key} onPress={() => setMode(key)} style={[courtStyles.segmentBtn, active && courtStyles.segmentActive]} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`${label} view`}>
            <Icon name={active ? icon : `${icon}-outline`} size={16} color={active ? C.ink : C.mist} />
            <Text style={[courtStyles.segmentText, active && { color: C.ink }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Search + filters + sort + status chips. Sticky above the list; also shown in Map mode.
function FindBar({ query, setQuery, status, setStatus, counts, sortLabel, filterCount, onOpenSheet }) {
  return (
    <View style={courtStyles.bar}>
      <View style={{ flexDirection: "row", gap: S.sm, paddingHorizontal: S.xl }}>
        <View style={[styles.searchField, { flex: 1 }]}>
          <Icon name="search" size={18} color={C.textDim} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search by name or area" placeholderTextColor={C.textFaint} style={styles.searchInput} accessibilityLabel="Search courts" autoCorrect={false} returnKeyType="search" />
          {query ? <TouchableOpacity onPress={() => setQuery("")} style={courtStyles.clearBtn} accessibilityRole="button" accessibilityLabel="Clear search"><Icon name="close-circle" size={18} color={C.textDim} /></TouchableOpacity> : null}
        </View>
        <TouchableOpacity onPress={onOpenSheet} style={[courtStyles.filterBtn, filterCount > 0 && courtStyles.filterBtnActive]} accessibilityRole="button" accessibilityLabel={filterCount ? `Filters, ${filterCount} active` : "Filters"}>
          <Icon name="options-outline" size={20} color={filterCount ? C.ink : C.paper} />
          {filterCount ? <View style={courtStyles.filterBadge}><Text style={courtStyles.filterBadgeText}>{filterCount}</Text></View> : null}
        </TouchableOpacity>
      </View>
      <ChipScroller style={courtStyles.chipRow} contentContainerStyle={{ alignItems: "center" }} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={onOpenSheet} style={[styles.chip, courtStyles.chip, courtStyles.sortChip]} accessibilityRole="button" accessibilityLabel={`Sorted by ${sortLabel}. Change sort`}>
          <Icon name="swap-vertical" size={14} color={C.volt} style={{ marginRight: 4 }} />
          <Text style={[styles.chipText, { color: C.volt }]}>{sortLabel}</Text>
        </TouchableOpacity>
        {STATUSES.map((f) => (
          <TouchableOpacity key={f} onPress={() => setStatus(f)} style={[styles.chip, courtStyles.chip, status === f && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: status === f }} accessibilityLabel={`${f}, ${counts[f]} courts`}>
            <Text style={[styles.chipText, status === f && styles.chipTextActive]}>{f} <Text style={{ opacity: 0.7 }}>{counts[f]}</Text></Text>
          </TouchableOpacity>
        ))}
      </ChipScroller>
    </View>
  );
}

export function CourtsScreen() {
  const { courts, dashboardLoading, dashboardError, findNearbyCourts, locationLoading, locationMessage, hasLocation, userLocation, reload, toggleFavorite, favoritesSupported } = useDashboard();
  const { setDetail } = useOverlayNav();
  const [mode, setMode] = useState("list");
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const [areaBounds, setAreaBounds] = useState(null);
  // null = automatic: nearest once we know where you are, else top rated.
  const [sortChoice, setSortChoice] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the pull-to-refresh spinner once the reload it triggered finishes
    if (!dashboardLoading) setRefreshing(false);
  }, [dashboardLoading]);

  const sort = sortChoice || (hasLocation ? "nearest" : "rating");
  const sortLabel = SORTS.find((s) => s.key === sort)?.label || "Sort";
  const term = query.trim().toLowerCase();

  // Search + map area, then the sheet's filters. Chip counts come from this
  // set so each status chip shows what tapping it would leave.
  const matching = useMemo(() => courts.filter((c) => (!term || `${c.name} ${c.area} ${c.address}`.toLowerCase().includes(term)) && insideBounds(c, areaBounds)), [courts, term, areaBounds]);
  const filtered = useMemo(() => filterCourts(matching, filters), [matching, filters]);
  const counts = useMemo(() => {
    const result = { All: filtered.length, Available: 0, Full: 0, Closed: 0 };
    filtered.forEach((c) => { result[c.status] += 1; });
    return result;
  }, [filtered]);
  const visible = useMemo(() => sortCourts(status === "All" ? filtered : filtered.filter((c) => c.status === status), sort), [filtered, status, sort]);
  const amenities = useMemo(() => amenityOptions(courts), [courts]);
  const filterCount = activeFilterCount(filters);
  const narrowed = Boolean(term || areaBounds || status !== "All" || filterCount);
  const clearAll = () => { setQuery(""); setAreaBounds(null); setStatus("All"); setFilters(DEFAULT_FILTERS); };
  const countFor = (draft) => {
    const list = filterCourts(matching, draft);
    return status === "All" ? list.length : list.filter((c) => c.status === status).length;
  };
  const applySheet = (nextSort, nextFilters) => {
    setSortChoice(nextSort);
    setFilters(nextFilters);
    if (nextSort === "nearest" && !hasLocation) findNearbyCourts();
  };
  const onToggleFavorite = favoritesSupported ? toggleFavorite : undefined;

  const subtitle = dashboardLoading ? "Loading courts…" : `${courts.length} court${courts.length === 1 ? "" : "s"} in Tagum City`;
  const findBar = <FindBar query={query} setQuery={setQuery} status={status} setStatus={setStatus} counts={counts} sortLabel={sortLabel} filterCount={filterCount} onOpenSheet={() => setSheetOpen(true)} />;
  const sheet = <CourtFilterSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} sort={sort} filters={filters} onApply={applySheet} amenities={amenities} countFor={countFor} favoritesSupported={favoritesSupported} hasLocation={hasLocation} />;
  const mapProps = {
    courts: visible,
    userLocation,
    locating: locationLoading,
    onLocate: findNearbyCourts,
    onOpenCourt: setDetail,
    onSearchArea: setAreaBounds,
    areaActive: Boolean(areaBounds),
    onClearArea: () => setAreaBounds(null),
    loading: dashboardLoading,
  };

  const emptyState = courts.length ? (
    <EmptyCard
      icon="search-outline"
      title="No courts match"
      message={areaBounds ? "Nothing in this map area with these filters." : term ? `Nothing matches “${query.trim()}”.` : filterCount ? "No courts match these filters." : `No ${status.toLowerCase()} courts right now.`}
    >
      {narrowed ? <Button label="Clear search & filters" icon="refresh" onPress={clearAll} style={{ marginTop: S.lg, minHeight: 44 }} /> : null}
    </EmptyCard>
  ) : (
    <EmptyCard icon="tennisball-outline" title="No courts yet" message="Courts in Tagum City will appear here once they are added." />
  );

  if (mode === "map") {
    return (
      <ScreenFrame>
        <HeaderBar showBack title="Courts" subtitle={subtitle} />
        <View style={{ paddingHorizontal: S.xl, marginTop: S.md }}>
          <ModeToggle mode={mode} setMode={setMode} />
        </View>
        {findBar}
        <View style={{ flex: 1 }}>
          <CourtsMapPanel {...mapProps} variant="full" onCollapse={() => setMode("list")} />
          {!dashboardLoading && !visible.length ? <View style={courtStyles.mapEmpty} pointerEvents="box-none">{emptyState}</View> : null}
        </View>
        {locationMessage ? <Text style={[styles.locationMessage, { marginHorizontal: S.xl, marginBottom: S.sm }]}>{locationMessage}</Text> : null}
        {sheet}
      </ScreenFrame>
    );
  }

  const items = dashboardLoading ? SKELETON_ITEMS : visible.length ? visible : [EMPTY];

  return (
    <ScreenFrame>
      <FlatList
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: 32 }}
        data={[BAR, ...items]}
        keyExtractor={(c) => c.id}
        // Sticky indices count ListHeaderComponent as 0, so the find bar (the
        // first data item) is index 1.
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={C.volt} colors={[C.volt]} progressBackgroundColor={C.surface} />}
        renderItem={({ item }) => {
          if (item.bar) return findBar;
          if (item.empty) return <View style={{ paddingHorizontal: S.xl }}>{emptyState}</View>;
          return (
            <View style={{ paddingHorizontal: S.xl, marginBottom: S.lg }}>
              {item.skeleton ? <CourtCardSkeleton /> : <CourtCard c={item} onPress={() => setDetail(item)} onToggleFavorite={onToggleFavorite} />}
            </View>
          );
        }}
        ListHeaderComponent={
          <>
            <HeaderBar showBack title="Courts" subtitle={subtitle} />
            <View style={{ paddingHorizontal: S.xl, marginTop: S.md }}>
              <ModeToggle mode={mode} setMode={setMode} />
            </View>
            <CourtsMapPanel {...mapProps} variant="preview" onExpand={() => setMode("map")} />
            {locationMessage ? <Text style={[styles.locationMessage, { marginHorizontal: S.xl }]}>{locationMessage}</Text> : null}
            {!hasLocation && !locationMessage ? (
              <TouchableOpacity onPress={findNearbyCourts} style={courtStyles.nearMe} accessibilityRole="button" accessibilityLabel="Use my location to sort courts by distance">
                <Icon name="navigate" size={14} color={C.volt} />
                <Text style={courtStyles.nearMeText}>{locationLoading ? "Finding your location…" : "Use my location to sort by distance"}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={{ height: S.md }} />
          </>
        }
        ListFooterComponent={<ErrorNote>{dashboardError}</ErrorNote>}
      />
      {sheet}
    </ScreenFrame>
  );
}

const courtStyles = StyleSheet.create({
  segment: { flexDirection: "row", backgroundColor: C.surface, borderRadius: R.md, padding: 4, borderWidth: 1, borderColor: C.line },
  segmentBtn: { flex: 1, flexDirection: "row", gap: 6, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: R.sm },
  segmentActive: { backgroundColor: C.volt },
  segmentText: { color: C.mist, fontSize: 14, fontWeight: "700" },
  // Opaque so cards don't show through while it's pinned.
  bar: { backgroundColor: C.ink, paddingTop: S.md, paddingBottom: S.md, borderBottomWidth: 1, borderColor: C.line, marginBottom: S.md },
  chipRow: { flexGrow: 0, flexShrink: 0, marginTop: S.md },
  chip: { minHeight: 44, justifyContent: "center", flexDirection: "row", alignItems: "center" },
  sortChip: { borderColor: "rgba(227,239,38,0.45)" },
  clearBtn: { width: 44, height: 44, marginRight: -12, alignItems: "center", justifyContent: "center" },
  filterBtn: { width: 50, height: 50, borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" },
  filterBtnActive: { backgroundColor: C.volt, borderColor: C.volt },
  filterBadge: { position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center" },
  filterBadgeText: { color: C.ink, fontSize: 11, fontWeight: "800" },
  nearMe: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, marginHorizontal: S.xl, marginTop: S.xs },
  nearMeText: { color: C.volt, fontSize: 13, fontWeight: "700" },
  mapEmpty: { position: "absolute", left: S.xl, right: S.xl, top: S.xl },
});
