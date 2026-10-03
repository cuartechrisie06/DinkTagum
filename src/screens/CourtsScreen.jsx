import React, { useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import CourtsMap from "../components/CourtsMap";
import { useDashboard } from "../context/DashboardContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { Button, C, CourtCard, EmptyCard, ErrorNote, HeaderBar, S, ScreenFrame, SectionTitle, styles } from "./shared";

const FILTERS = ["All", "Available", "Full", "Closed"];
const SKELETON_ITEMS = Array.from({ length: 4 }, (_, index) => ({ id: `skeleton-${index}`, skeleton: true }));

function CourtCardSkeleton() {
  return (
    <View style={styles.courtCard}>
      <View style={[styles.courtThumb, { backgroundColor: C.surface2 }]} />
      <View style={{ padding: S.md, paddingTop: S.sm + 2 }}>
        <View style={{ height: 16, width: "70%", borderRadius: 4, backgroundColor: C.surface2 }} />
        <View style={{ height: 12, width: "45%", borderRadius: 4, backgroundColor: C.surface2, marginTop: 10 }} />
      </View>
    </View>
  );
}

function CourtsTab({ openCourt, courts, loading, error, onFindNearby, locationLoading, locationMessage, hasLocation, onReload }) {
  const [filter, setFilter] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const visible = filter === "All" ? courts : courts.filter((c) => c.status === filter);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the pull-to-refresh spinner once the reload it triggered finishes
    if (!loading) setRefreshing(false);
  }, [loading]);

  const handleRefresh = () => {
    setRefreshing(true);
    onReload();
  };

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 32 }}
      data={loading ? SKELETON_ITEMS : visible}
      keyExtractor={(c) => c.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.volt} colors={[C.volt]} progressBackgroundColor={C.surface} />
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: S.xl, marginBottom: S.lg }}>
          {item.skeleton ? <CourtCardSkeleton /> : <CourtCard c={item} onPress={() => openCourt(item)} />}
        </View>
      )}
      ListHeaderComponent={
        <>
          <HeaderBar showBack title="Courts" subtitle={loading ? "Loading courts…" : `${courts.length} court${courts.length === 1 ? "" : "s"} in Tagum City`} />
          <View style={{ paddingHorizontal: S.xl, marginTop: S.lg }}>
            <Button
              variant={hasLocation ? "ghost" : "primary"}
              icon={hasLocation ? "refresh" : "navigate"}
              label={locationLoading ? "Finding nearby…" : hasLocation ? "Refresh nearby courts" : "Find courts near me"}
              onPress={onFindNearby}
              loading={locationLoading}
              style={{ minHeight: 46 }}
            />
            {locationMessage ? <Text style={styles.locationMessage}>{locationMessage}</Text> : null}
          </View>

          <View style={{ paddingHorizontal: S.xl, marginTop: S.xl }}>
            <SectionTitle>Map</SectionTitle>
            <Text style={styles.mapDescription}>Tap a pin to see court details.</Text>
          </View>
          <CourtsMap courts={courts} onCourtPress={openCourt} />

          <View style={{ paddingHorizontal: S.xl, marginTop: S.xl }}>
            <SectionTitle>All courts</SectionTitle>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md, marginBottom: S.lg }} contentContainerStyle={{ paddingHorizontal: S.xl }}>
            {FILTERS.map((f) => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]} accessibilityRole="button" accessibilityState={{ selected: filter === f }}>
                <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={{ paddingHorizontal: S.xl }}>
            <EmptyCard icon="tennisball-outline" title={courts.length ? `No ${filter.toLowerCase()} courts` : "No courts yet"} message={courts.length ? "Try a different filter." : "Courts in Tagum City will appear here once they are added."} />
          </View>
        )
      }
      ListFooterComponent={<ErrorNote>{error}</ErrorNote>}
    />
  );
}

export function CourtsScreen() {
  const { courts, dashboardLoading, dashboardError, findNearbyCourts, locationLoading, locationMessage, hasLocation, reload } = useDashboard();
  const { setDetail } = useOverlayNav();
  return (
    <ScreenFrame>
      <CourtsTab
        openCourt={setDetail}
        courts={courts}
        loading={dashboardLoading}
        error={dashboardError}
        onFindNearby={findNearbyCourts}
        locationLoading={locationLoading}
        locationMessage={locationMessage}
        hasLocation={hasLocation}
        onReload={reload}
      />
    </ScreenFrame>
  );
}
