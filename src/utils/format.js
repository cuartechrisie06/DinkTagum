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
