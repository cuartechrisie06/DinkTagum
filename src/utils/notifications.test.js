import { dedupeNotifications, groupByType, notificationTarget } from "./notifications";

const received = (id, is_read = true) => ({ id, kind: "reservation", title: "Reservation received", body: "Your court reservation is pending confirmation.", related_id: null, is_read });

describe("dedupeNotifications", () => {
  it("collapses repeated identical notifications into the newest", () => {
    const list = dedupeNotifications([received("n3"), received("n2", false), received("n1")]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "n3", ids: ["n3", "n2", "n1"], duplicates: 2, is_read: false });
  });

  it("keeps notifications about different bookings or events apart", () => {
    const list = dedupeNotifications([
      { ...received("a"), related_id: "r1" },
      { ...received("b"), related_id: "r2" },
      { ...received("c"), title: "Reservation confirmed", related_id: "r1" },
    ]);
    expect(list.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupByType", () => {
  it("buckets by kind in a fixed order with unread counts", () => {
    const sections = groupByType([
      { id: "1", kind: "community", is_read: true },
      { id: "2", kind: "reservation", is_read: false },
      { id: "3", kind: "match", is_read: false },
      { id: "4", kind: "open_play", is_read: true },
      { id: "5", kind: "system", is_read: true },
    ]);
    expect(sections.map((s) => s.key)).toEqual(["bookings", "games", "social", "other"]);
    expect(sections[0].title).toBe("Bookings · 1 new");
    expect(sections[1].data.map((n) => n.id)).toEqual(["3", "4"]);
    expect(sections[2].title).toBe("Community & connections");
  });
});

describe("notificationTarget", () => {
  const court = { id: "c1", name: "Magugpo" };
  const context = { reservations: [{ id: "r1", court_id: "c1", court }], games: [{ id: "g1", court_id: "c1" }], courtsById: { c1: court } };

  it("opens the court for a booking or open game it knows about", () => {
    expect(notificationTarget({ kind: "reservation", related_id: "r1" }, context)).toEqual({ type: "court", court });
    expect(notificationTarget({ kind: "open_play", related_id: "g1" }, context)).toEqual({ type: "court", court });
  });

  it("falls back to the right tab", () => {
    expect(notificationTarget({ kind: "reservation", related_id: "gone" }, context)).toEqual({ type: "route", path: "/history" });
    expect(notificationTarget({ kind: "match" }, context)).toEqual({ type: "route", path: "/history" });
    expect(notificationTarget({ kind: "connection" }, context)).toEqual({ type: "route", path: "/directory" });
    expect(notificationTarget({ kind: "community" }, context)).toEqual({ type: "route", path: "/feed" });
  });

  it("opens the conversation for messages", () => {
    expect(notificationTarget({ kind: "message", related_id: "conv-1" })).toEqual({ type: "chat", id: "conv-1" });
  });
});
