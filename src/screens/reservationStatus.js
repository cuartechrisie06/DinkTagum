import { C } from "./shared";

// Badge look for each reservation state (see utils/reservations.js).
export const RESERVATION_STATUS = {
  pending: { label: "Pending confirmation", short: "Pending", fg: C.butter, bg: "rgba(255,239,179,0.14)", icon: "time-outline" },
  confirmed: { label: "Confirmed", short: "Confirmed", fg: C.volt, bg: C.voltSoft, icon: "checkmark-circle" },
  declined: { label: "Declined by venue", short: "Declined", fg: C.butter, bg: "rgba(255,239,179,0.08)", icon: "close-circle" },
  cancelled: { label: "Cancelled", short: "Cancelled", fg: C.textDim, bg: "rgba(255,253,238,0.08)", icon: "close-circle-outline" },
  past: { label: "Past", short: "Past", fg: C.textDim, bg: "rgba(255,253,238,0.08)", icon: "checkmark-done-outline" },
};
