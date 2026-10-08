// Community feed rules: post validation, posting rate limit, report reasons,
// and which posts a player should see. Pure, so the rules are testable; the
// database enforces the same limits (see the community safety migration).

export const POST_MIN_CHARS = 3;
export const POST_MAX_CHARS = 2000;

// Max posts per player inside the window. Mirrored by the
// community_posts_rate_limit trigger.
export const POST_RATE_LIMIT = { max: 3, windowMs: 60 * 1000 };

export const POST_TYPES = ["text", "photo", "checkin", "match"];

export const REPORT_REASONS = [
  { key: "spam", label: "Spam or advertising" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "hate", label: "Hate speech or symbols" },
  { key: "inappropriate", label: "Nudity or inappropriate content" },
  { key: "misinformation", label: "False or misleading" },
  { key: "other", label: "Something else" },
];

// Returns an error message, or null when the post can be published.
// Text needs a few real characters; photo, check-in and match posts carry
// their own content, so a short caption (or the generated one) is enough.
export function validatePost({ type = "text", body = "", photoUrls = [], courtId = null, matchRecordId = null }) {
  const text = String(body || "").trim();
  if (!POST_TYPES.includes(type)) return "Choose what kind of post this is.";
  if (text.length > POST_MAX_CHARS) return `Keep posts under ${POST_MAX_CHARS} characters.`;
  if (type === "photo" && !photoUrls.length) return "Add a photo for a photo post.";
  if (type === "checkin" && !courtId) return "Pick the court you're checking in at.";
  if (type === "match" && !matchRecordId) return "Pick the match you want to share.";
  if (type === "text") {
    if (text.length < POST_MIN_CHARS) return `Write at least ${POST_MIN_CHARS} characters.`;
    if (!/[\p{L}\p{N}]/u.test(text)) return "Add some words. Posts can't be only symbols or emoji.";
  }
  return null;
}

// How many posts the player can still make right now. `recent` is their own
// post timestamps (ms or ISO), any order.
export function checkPostRateLimit(recent, now = Date.now(), { max, windowMs } = POST_RATE_LIMIT) {
  const inWindow = recent
    .map((t) => (typeof t === "number" ? t : new Date(t).getTime()))
    .filter((t) => Number.isFinite(t) && now - t < windowMs)
    .sort((a, b) => a - b);
  if (inWindow.length < max) return { ok: true, retryInSec: 0 };
  const retryInSec = Math.max(1, Math.ceil((inWindow[inWindow.length - max] + windowMs - now) / 1000));
  return { ok: false, retryInSec };
}

// Body text for post types that generate their own (shown if the player
// leaves the caption empty).
export function defaultPostBody({ type, court, match }) {
  if (type === "checkin" && court) return `Checked in at ${court.name}`;
  if (type === "match" && match) {
    const won = Number(match.player_score) > Number(match.opponent_score);
    return `${won ? "Won" : "Lost"} ${match.player_score}–${match.opponent_score} vs ${match.opponents}`;
  }
  if (type === "photo") return "Shared a photo";
  return "";
}

// Final body text: generated text for check-ins and matches (other players
// can't read your match records), plus whatever the player wrote.
export function composePostBody({ type, caption, court, match }) {
  const text = String(caption || "").trim();
  if (type === "match") return [defaultPostBody({ type, match }), text].filter(Boolean).join("\n");
  return text || defaultPostBody({ type, court, match });
}

// Hides posts the player reported and anything from players they blocked.
export function visiblePosts(posts, { blockedIds = new Set(), reportedIds = new Set() } = {}) {
  return posts.filter((post) => !blockedIds.has(post.author_id) && !reportedIds.has(post.id));
}

export function visibleComments(comments, blockedIds = new Set()) {
  return comments.filter((comment) => !blockedIds.has(comment.author_id));
}

// Friendlier text for the database's rate-limit / validation errors.
export function postErrorMessage(error) {
  const message = String(error?.message || "");
  if (/posting too fast/i.test(message)) return "You're posting too fast. Wait a minute and try again.";
  if (/community_posts_body_check|char_length/i.test(message)) return `Posts need between 1 and ${POST_MAX_CHARS} characters.`;
  return message || "Something went wrong. Please try again.";
}
