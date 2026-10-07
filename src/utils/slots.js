// "4:00 PM"-style booking slot helpers, shared by DashboardContext and utils/courts.

export function parseSlotLabel(timeLabel) {
  const [time, meridiem] = timeLabel.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

// True once a slot on the given day has started, so it can no longer be booked.
export function slotHasStarted(dayDate, timeLabel, now = Date.now()) {
  const { hour, minute } = parseSlotLabel(timeLabel);
  const start = new Date(dayDate);
  start.setHours(hour, minute, 0, 0);
  return start.getTime() <= now;
}

export function slotOverlapsBusy(dayDate, timeLabel, busyRanges) {
  const { hour, minute } = parseSlotLabel(timeLabel);
  const start = new Date(dayDate);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return busyRanges.some((range) => {
    const busyStart = new Date(range.start_time).getTime();
    const busyEnd = new Date(range.end_time).getTime();
    return start.getTime() < busyEnd && end.getTime() > busyStart;
  });
}
