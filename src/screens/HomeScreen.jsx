import React from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { useCommunityFeed } from "../context/CommunityFeedContext";
import { useOverlayNav } from "../context/OverlayNavContext";
import { reservationTime } from "../utils/format";
import { C, CourtCard, EmptyCard, ErrorNote, HeaderBar, Icon, PostCardCompact, S, ScreenFrame, SectionTitle, profileName, styles } from "./shared";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function HomeTab({ openCourt, openChat, openNotifications, goTab, profile, user, courts, reservation, loading, error, posts, postsLoading, postsError, unreadMessages, unreadNotifications }) {
  const name = profileName(profile, user);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <HeaderBar eyebrow={`${greeting()},`} title={name.split(" ")[0]} subtitle={profile?.location || "Tagum City"} onChat={openChat} onNotifications={openNotifications} chatBadge={unreadMessages > 0} notificationBadge={unreadNotifications > 0} />

      <TouchableOpacity activeOpacity={0.9} onPress={() => (reservation?.court ? openCourt(reservation.court) : goTab("courts"))} accessibilityRole="button" accessibilityLabel={reservation ? "Open your next reservation" : "Find a court to reserve"}>
        <LinearGradient colors={[C.brand, "#0A4F41"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.reservationCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: S.md }}>
              <Text style={styles.reservationLabel}>NEXT RESERVATION</Text>
              <Text style={styles.reservationName} numberOfLines={1}>{loading ? "Loading…" : reservation?.court?.name || "No upcoming games"}</Text>
              <Text style={styles.reservationTime}>{loading ? " " : reservation ? reservationTime(reservation) : "Book a court and it will show up here."}</Text>
            </View>
            <View style={styles.reservationIcon}>
              {loading ? <ActivityIndicator color={C.volt} /> : <Icon name={reservation ? "calendar" : "add"} size={24} color={C.volt} />}
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.quickActionsRow}>
        {[
          { icon: "location", label: "Find court", tab: "courts" },
          { icon: "people", label: "Find players", tab: "players" },
          { icon: "chatbubbles", label: "Community", tab: "feed" },
        ].map((a) => (
          <TouchableOpacity key={a.label} onPress={() => goTab(a.tab)} style={styles.quickAction} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={a.label}>
            <View style={styles.quickActionIcon}><Icon name={a.icon} size={20} color={C.volt} /></View>
            <Text style={styles.quickActionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <SectionTitle action="See all" onAction={() => goTab("courts")}>Courts nearby</SectionTitle>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 22 }} color={C.volt} /> : courts.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: S.md }} contentContainerStyle={{ paddingLeft: S.xl, paddingRight: S.sm }}>
          {courts.slice(0, 5).map((c) => <CourtCard key={c.id} c={c} compact onPress={() => openCourt(c)} />)}
          {courts.length > 5 ? (
            <TouchableOpacity
              onPress={() => goTab("courts")}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`See all ${courts.length} courts`}
              style={{ width: 80, marginRight: S.md, alignItems: "center", justifyContent: "center" }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.voltSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name="arrow-forward" size={18} color={C.volt} />
              </View>
              <Text style={{ color: C.volt, fontSize: 11.5, fontWeight: "700", marginTop: S.sm, textAlign: "center" }}>
                +{courts.length - 5} more
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : <View style={{ paddingHorizontal: S.xl, marginTop: S.md }}><EmptyCard icon="tennisball-outline" title="No courts yet" message="Courts in Tagum City will appear here once they are added." /></View>}
      <ErrorNote>{error}</ErrorNote>

      <View style={{ paddingHorizontal: S.xl, marginTop: S.xxl }}>
        <SectionTitle action="Open feed" onAction={() => goTab("feed")}>Community highlights</SectionTitle>
        <View style={{ marginTop: S.md }}>
          {postsLoading ? <ActivityIndicator color={C.volt} /> : posts.length ? posts.slice(0, 3).map((p) => (
            <PostCardCompact key={p.id} p={p} onPress={() => goTab("feed")} />
          )) : <EmptyCard icon="chatbubbles-outline" title="It's quiet here" message="Share a game update to get the community going." />}
        </View>
      </View>
      <ErrorNote>{postsError}</ErrorNote>
    </ScrollView>
  );
}

export function useGoTab() {
  const router = useRouter();
  const { setDetail, setChatView, setNotificationView, setAdminView } = useOverlayNav();
  return (t) => {
    const routes = { home: "/", courts: "/courts", history: "/history", directory: "/directory", players: "/directory", feed: "/feed", profile: "/profile" };
    setDetail(null);
    setChatView(null);
    setNotificationView(false);
    setAdminView(false);
    router.navigate(routes[t] || "/");
  };
}

export function HomeScreen() {
  const { session } = useAuth();
  const dashboard = useDashboard();
  const feed = useCommunityFeed();
  const { setDetail, setChatView, setNotificationView, unreadMessages, unreadNotifications } = useOverlayNav();
  const goTab = useGoTab();
  return (
    <ScreenFrame>
      <HomeTab
        openCourt={setDetail}
        openChat={() => setChatView("list")}
        openNotifications={() => setNotificationView(true)}
        goTab={goTab}
        profile={dashboard.profile}
        user={session.user}
        courts={dashboard.courts}
        reservation={dashboard.reservation}
        loading={dashboard.dashboardLoading}
        error={dashboard.dashboardError}
        posts={feed.communityPosts}
        postsLoading={feed.postsLoading}
        postsError={feed.postsError}
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications}
      />
    </ScreenFrame>
  );
}
