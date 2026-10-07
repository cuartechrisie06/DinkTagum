export function initialsFor(name, fallback = "DT") {
  const initials = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return initials.toUpperCase() || fallback;
}

export function reservationTime(reservation) {
  if (!reservation?.start_time) return "Time to be confirmed";
  const start = new Date(reservation.start_time);
  const end = reservation.end_time ? new Date(reservation.end_time) : null;
  const date = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endTime = end ? ` – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  return `${date} · ${time}${endTime}`;
}

// A conversation (row from the list_my_conversations RPC) counts as unread
// when its last message was sent by the other participant and either hasn't
// been read yet, or was sent after our last read timestamp.
export function isConversationUnread(conversation, userId) {
  return Boolean(
    conversation.last_message_created_at
    && conversation.last_message_sender_id !== userId
    && (!conversation.my_last_read_at || new Date(conversation.last_message_created_at) > new Date(conversation.my_last_read_at))
  );
}

export function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "Today · 4:00 PM", "Tomorrow · 6:00 AM", or "Sat, Oct 10 · 4:00 PM".
export function gameTimeLabel(value, now = Date.now()) {
  const start = new Date(value);
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startDay.getTime() - today.getTime()) / 86400000);
  const day = dayDiff === 0 ? "Today" : dayDiff === 1 ? "Tomorrow" : start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

// Matches the 1.0–5.0 self-rating scale used on profiles.
export function skillTier(level) {
  const value = Number(level || 3);
  if (value < 2.5) return "Beginner";
  if (value < 3.0) return "Developing";
  if (value < 4.0) return "Intermediate";
  if (value < 4.5) return "Advanced";
  return "Expert";
}

// "Today", "Yesterday", or "Mon, Oct 5" for chat day dividers and
// notification groups.
export function dayLabel(value, now = Date.now()) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function clockTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Chat: a timestamp closes each burst — shown when the next message is from
// someone else, more than 5 minutes later, or there is no next message.
export function endsMessageGroup(message, next) {
  if (!next) return true;
  if (next.sender_id !== message.sender_id) return true;
  return new Date(next.created_at) - new Date(message.created_at) > 5 * 60 * 1000;
}

// Groups rows with created_at into [{ title, data }] sections (Today / Earlier).
export function groupByRecency(rows, now = Date.now()) {
  const today = rows.filter((row) => dayLabel(row.created_at, now) === "Today");
  const earlier = rows.filter((row) => dayLabel(row.created_at, now) !== "Today");
  return [{ title: "Today", data: today }, { title: "Earlier", data: earlier }].filter((section) => section.data.length);
}
