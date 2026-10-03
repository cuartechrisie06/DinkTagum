import { communityPostForDisplay } from "./CommunityFeedContext";

describe("communityPostForDisplay", () => {
  const currentUser = { id: "me" };
  const currentProfile = { display_name: "My Name", avatar_url: "me.png" };

  it("uses the current profile when the post is authored by the current user", () => {
    const post = { author_id: "me", body: "hello", created_at: new Date().toISOString() };
    const display = communityPostForDisplay(post, {}, currentUser, currentProfile);
    expect(display.name).toBe("My Name");
    expect(display.initials).toBe("MN");
    expect(display.text).toBe("hello");
  });

  it("looks up other authors from the provided profile map", () => {
    const post = { author_id: "other", body: "hi", created_at: new Date().toISOString() };
    const display = communityPostForDisplay(post, { other: { display_name: "Other Player" } }, currentUser, currentProfile);
    expect(display.name).toBe("Other Player");
  });

  it("falls back to a generic name when the author is unknown", () => {
    const post = { author_id: "ghost", body: "hi", created_at: new Date().toISOString() };
    const display = communityPostForDisplay(post, {}, currentUser, currentProfile);
    expect(display.name).toBe("DinkTagum player");
  });
});
