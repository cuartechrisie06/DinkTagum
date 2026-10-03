import { upsertMessage } from "./ChatScreens";

describe("upsertMessage", () => {
  it("appends a new message in chronological order", () => {
    const current = [{ id: "1", created_at: "2026-01-01T00:00:00.000Z" }];
    const next = upsertMessage(current, { id: "2", created_at: "2026-01-01T00:01:00.000Z" });
    expect(next.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("replaces the matching optimistic message instead of duplicating it", () => {
    const current = [{ id: "local-1", clientId: "local-1", content: "hi", status: "sending" }];
    const next = upsertMessage(current, { id: "real-1", content: "hi", status: undefined }, "local-1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("real-1");
  });

  it("ignores a realtime echo of a message it already has by real id", () => {
    const current = [{ id: "real-1", content: "hi" }];
    const next = upsertMessage(current, { id: "real-1", content: "hi" });
    expect(next).toBe(current);
  });

  it("does not duplicate when the realtime event arrives before the insert response resolves", () => {
    // Realtime delivers the real row first (no clientId to match against).
    let messages = upsertMessage([], { id: "real-1", content: "hi", created_at: "2026-01-01T00:00:00.000Z" });
    // The sender's own insert() response then resolves and tries to reconcile
    // the (now-missing) optimistic entry — it must not add a second copy.
    messages = upsertMessage(messages, { id: "real-1", content: "hi", created_at: "2026-01-01T00:00:00.000Z" }, "local-1");
    expect(messages).toHaveLength(1);
  });
});
