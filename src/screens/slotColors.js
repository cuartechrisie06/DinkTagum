import { C } from "./shared";

// Slot grid states on the court page. Each pair is checked for WCAG AA in
// src/utils/contrast.test.js: text ≥4.5:1 on its fill, outline ≥3:1 where
// the slot is tappable. Taken and Started differ by more than color (strike-
// through text, dashed outline, and their own label) for color-blind players.
export const SLOT_COLORS = {
  free: { bg: C.surface, border: C.lineControl, text: C.paper, sub: C.textDim, borderStyle: "solid" },
  selected: { bg: C.voltSoft, border: C.volt, text: C.volt, sub: C.volt, borderStyle: "solid" },
  taken: { bg: "rgba(255,239,179,0.06)", border: "rgba(255,239,179,0.45)", text: "rgba(255,239,179,0.85)", sub: "rgba(255,239,179,0.85)", borderStyle: "dashed" },
  started: { bg: C.ink, border: C.line, text: C.textFaint, sub: C.textFaint, borderStyle: "dashed" },
};

export const SLOT_LEGEND = [
  ["Free", "free"],
  ["Selected", "selected"],
  ["Taken", "taken"],
  ["Started", "started"],
];
