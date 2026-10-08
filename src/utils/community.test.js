import { checkPostRateLimit, composePostBody, defaultPostBody, postErrorMessage, POST_RATE_LIMIT, validatePost, visibleComments, visiblePosts } from "./community";

describe("validatePost", () => {
  it("requires a few real characters for text posts", () => {
    expect(validatePost({ type: "text", body: "  " })).toMatch(/at least 3/);
    expect(validatePost({ type: "text", body: "ok" })).toMatch(/at least 3/);
    expect(validatePost({ type: "text", body: "!!!???" })).toMatch(/only symbols/);
    expect(validatePost({ type: "text", body: "Good rally today" })).toBeNull();
    expect(validatePost({ type: "text", body: "x".repeat(2001) })).toMatch(/under 2000/);
  });

  it("checks what each post type needs", () => {
    expect(validatePost({ type: "photo", body: "Shared a photo", photoUrls: [] })).toMatch(/Add a photo/);
    expect(validatePost({ type: "photo", body: "Shared a photo", photoUrls: ["https://x/y.jpg"] })).toBeNull();
    expect(validatePost({ type: "checkin", body: "Checked in" })).toMatch(/court/);
    expect(validatePost({ type: "checkin", body: "Checked in", courtId: "c1" })).toBeNull();
    expect(validatePost({ type: "match", body: "Won" })).toMatch(/match/);
    expect(validatePost({ type: "poll", body: "Hello there" })).toMatch(/kind of post/);
  });
});

describe("checkPostRateLimit", () => {
  const now = 1_000_000;

  it(`allows up to ${POST_RATE_LIMIT.max} posts a minute`, () => {
    expect(checkPostRateLimit([now - 5_000, now - 10_000], now)).toEqual({ ok: true, retryInSec: 0 });
  });

  it("blocks the next post and says when to retry", () => {
    const result = checkPostRateLimit([now - 50_000, now - 20_000, now - 1_000], now);
    expect(result.ok).toBe(false);
    expect(result.retryInSec).toBe(10); // the oldest of the 3 leaves the window in 10s
  });

  it("ignores posts older than the window and accepts ISO timestamps", () => {
    const old = new Date(now - 120_000).toISOString();
    expect(checkPostRateLimit([old, old, old, now - 1_000], now).ok).toBe(true);
  });
});

describe("post bodies", () => {
  const match = { player_score: 11, opponent_score: 7, opponents: "Ana" };

  it("generates text for check-ins and matches", () => {
    expect(defaultPostBody({ type: "checkin", court: { name: "Magugpo" } })).toBe("Checked in at Magugpo");
    expect(defaultPostBody({ type: "match", match })).toBe("Won 11–7 vs Ana");
    expect(defaultPostBody({ type: "match", match: { ...match, player_score: 5 } })).toBe("Lost 5–7 vs Ana");
  });

  it("always keeps the score on match posts and uses the caption otherwise", () => {
    expect(composePostBody({ type: "match", caption: "Close one!", match })).toBe("Won 11–7 vs Ana\nClose one!");
    expect(composePostBody({ type: "checkin", caption: "", court: { name: "Magugpo" } })).toBe("Checked in at Magugpo");
    expect(composePostBody({ type: "checkin", caption: "Need 1 more", court: { name: "Magugpo" } })).toBe("Need 1 more");
  });
});

describe("visibility", () => {
  const posts = [{ id: "p1", author_id: "a" }, { id: "p2", author_id: "b" }, { id: "p3", author_id: "c" }];

  it("hides blocked authors and posts I reported", () => {
    expect(visiblePosts(posts, { blockedIds: new Set(["b"]), reportedIds: new Set(["p3"]) }).map((p) => p.id)).toEqual(["p1"]);
    expect(visibleComments([{ author_id: "a" }, { author_id: "b" }], new Set(["a"]))).toEqual([{ author_id: "b" }]);
  });

  it("explains database errors", () => {
    expect(postErrorMessage({ message: "You are posting too fast. Wait a minute and try again." })).toMatch(/too fast/);
    expect(postErrorMessage({ message: "boom" })).toBe("boom");
  });
});
