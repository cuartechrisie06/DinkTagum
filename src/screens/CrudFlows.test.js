import React from "react";
import renderer, { act } from "react-test-renderer";

const calls = [];
jest.mock("../../lib/supabase", () => {
  const rows = {
    game_records: [{ id: "g1", played_on: "2026-01-02", opponents: "Ana", player_score: 11, opponent_score: 5, result: "win" }],
    reservations: [{ id: "r1", user_id: "u1", court_id: "c1", start_time: "2999-01-01T08:00:00Z", end_time: "2999-01-01T09:00:00Z", status: "pending", courts: { name: "Magugpo" } }],
    courts: [{ id: "c1", name: "Magugpo", status: "Available", court_count: 2, amenities: [] }],
    community_posts: [{ id: "p1", author_id: "u2", body: "Reported", created_at: "2026-01-01T00:00:00Z" }, { id: "p2", author_id: "u1", body: "Mine", created_at: "2026-01-01T00:00:00Z" }],
    profiles: [{ id: "u2", display_name: "Ben", is_directory_visible: true }],
    notifications: [
      { id: "n1", kind: "reservation", title: "Hi", is_read: false, created_at: "2026-01-01T00:00:00Z" },
      { id: "n2", kind: "message", title: "Ben sent you a message", body: "Let's play", related_id: "conv-123", is_read: false, created_at: "2026-01-01T00:00:00Z" },
    ],
    community_post_likes: [],
    community_post_comments: [],
  };
  const builder = (table, op = "select", payload) => {
    const state = { single: false, id: null };
    const chain = new Proxy(function () {}, {
      get: (_t, prop) => {
        if (prop === "then") {
          const base = rows[table].find((r) => r.id === state.id) || rows[table][0];
          const data = op === "select" ? (state.single ? base : rows[table]) : (state.single ? { ...base, ...(Array.isArray(payload) ? {} : payload) } : null);
          return (res) => Promise.resolve({ data, error: null, count: rows[table]?.length || 0 }).then(res);
        }
        if (["insert", "update", "delete", "upsert"].includes(prop)) return (body) => { calls.push([table, prop, body]); return builder(table, prop, body); };
        if (prop === "single" || prop === "maybeSingle") return () => { state.single = true; return chain; };
        if (prop === "eq") return (col, val) => { if (col === "id") state.id = val; return chain; };
        return () => chain;
      },
    });
    return chain;
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (table) => builder(table),
      rpc: (name, args) => { calls.push(["rpc", name, args]); return Promise.resolve({ data: [], error: null }); },
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1", app_metadata: { role: "admin" } } }, error: null }) },
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
  };
});
jest.mock("../utils/confirm", () => ({ confirmAction: () => Promise.resolve(true), notify: jest.fn() }));
jest.mock("expo-location", () => ({}));
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "u1", email: "a@b.c" } }, isAdmin: true, signOut: jest.fn() }) }));

const { SafeAreaProvider } = require("react-native-safe-area-context");
const { DashboardProvider } = require("../context/DashboardContext");
const { GameRecordsProvider } = require("../context/GameRecordsContext");
const { HistoryScreen } = require("./HistoryScreen");
const { AdminTab } = require("./AdminTab");
const { NotificationCenter } = require("./NotificationCenter");
const { FeedScreen } = require("./FeedScreen");
const { CommunityFeedProvider } = require("../context/CommunityFeedContext");

const wrap = (el) => (
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <DashboardProvider><GameRecordsProvider>{el}</GameRecordsProvider></DashboardProvider>
  </SafeAreaProvider>
);
const press = async (tree, label) => {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];
  if (!node) throw new Error(`No pressable "${label}" in: ${[...new Set(tree.root.findAll((n) => n.props.accessibilityLabel).map((n) => n.props.accessibilityLabel))].join(" | ")}`);
  await act(async () => { await node.props.onPress(); });
};
const render = async (el) => { let tree; await act(async () => { tree = renderer.create(wrap(el)); }); await act(async () => {}); return tree; };

beforeEach(() => { calls.length = 0; });

it("History: deletes a match and cancels a reservation", async () => {
  const tree = await render(<HistoryScreen />);
  await press(tree, "Delete match against Ana");
  expect(calls).toContainEqual(["game_records", "delete", undefined]);
  const tab = tree.root.findAll((n) => n.props.accessibilityRole === "tab" && typeof n.props.onPress === "function").pop();
  await act(async () => tab.props.onPress());
  await press(tree, "Cancel reservation at Magugpo");
  expect(calls).toContainEqual(["reservations", "update", { status: "cancelled" }]);
}, 60000);

it("History: creates a match", async () => {
  const tree = await render(<HistoryScreen />);
  await press(tree, "Record a match");
  const input = (label, value) => act(async () => tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onChangeText)[0].props.onChangeText(value));
  await input("Opponents", "Carlo");
  await input("Your score", "11");
  await input("Opponent score", "9");
  await press(tree, "Save match");
  expect(calls.find((c) => c[0] === "game_records" && c[1] === "insert")[2]).toMatchObject({ opponents: "Carlo", player_score: 11, opponent_score: 9, player_id: "u1" });
}, 60000);

it("Admin: confirms a reservation (with notification), deletes a court and a reported post", async () => {
  const tree = await render(<AdminTab user={{ id: "u1" }} onBack={jest.fn()} />);
  await press(tree, "Confirm");
  expect(calls).toContainEqual(["reservations", "update", { status: "confirmed" }]);
  expect(calls.find((c) => c[0] === "notifications" && c[1] === "insert")[2]).toMatchObject({ recipient_id: "u1", kind: "reservation", title: "Reservation confirmed" });
  await press(tree, "Delete Magugpo");
  expect(calls).toContainEqual(["courts", "delete", undefined]);
  await press(tree, "Delete this reported post");
  expect(calls).toContainEqual(["community_posts", "delete", undefined]);
}, 60000);

it("Notifications: marks all read", async () => {
  const tree = await render(<NotificationCenter user={{ id: "u1" }} onBack={jest.fn()} />);
  await press(tree, "Mark all read");
  expect(calls).toContainEqual(["notifications", "update", { is_read: true }]);
}, 60000);

it("Notifications: tapping a message notification directs to the conversation and marks it read", async () => {
  const onOpenConvo = jest.fn();
  const tree = await render(<NotificationCenter user={{ id: "u1" }} onBack={jest.fn()} onOpenConversation={onOpenConvo} />);
  await press(tree, "Ben sent you a message, unread · Tap to open chat");
  expect(calls).toContainEqual(["notifications", "update", { is_read: true }]);
  expect(onOpenConvo).toHaveBeenCalledWith("conv-123");
}, 60000);

it("Feed: edits and deletes my post, reports someone else's", async () => {
  const tree = await render(<CommunityFeedProvider><FeedScreen /></CommunityFeedProvider>);
  await press(tree, "Report");
  expect(calls).toContainEqual(["rpc", "report_community_post", { p_post_id: "p1" }]);
  await press(tree, "Edit");
  await act(async () => tree.root.findAll((n) => n.props.accessibilityLabel === "Edit post" && n.props.onChangeText)[0].props.onChangeText("Updated body"));
  await press(tree, "Save");
  expect(calls.find((c) => c[0] === "community_posts" && c[1] === "update")[2]).toMatchObject({ body: "Updated body" });
  await press(tree, "Delete");
  expect(calls).toContainEqual(["community_posts", "delete", undefined]);
}, 60000);
