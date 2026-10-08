jest.mock("../../lib/supabase", () => ({ supabase: null }));
jest.mock("./AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "u1" } } }) }));
const { isFreshUnread } = require("./OverlayNavContext");

describe("isFreshUnread", () => {
  const now = new Date("2026-10-07T12:00:00Z").getTime();
  const row = (extra) => ({ is_read: false, created_at: new Date(now - 2000).toISOString(), ...extra });

  it("treats inserts and re-armed message rows as new arrivals", () => {
    expect(isFreshUnread({ eventType: "INSERT", new: row() }, now)).toBe(true);
    expect(isFreshUnread({ eventType: "UPDATE", new: row() }, now)).toBe(true);
  });

  it("ignores mark-read updates and old rows", () => {
    expect(isFreshUnread({ eventType: "UPDATE", new: row({ is_read: true }) }, now)).toBe(false);
    expect(isFreshUnread({ eventType: "UPDATE", new: row({ created_at: new Date(now - 3600000).toISOString() }) }, now)).toBe(false);
    expect(isFreshUnread({ eventType: "DELETE", old: { id: "x" } }, now)).toBe(false);
  });
});
