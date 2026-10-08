import { AA_LARGE, AA_TEXT, contrastRatio, parseColor } from "./contrast";
import { C, hasMoreToRight } from "../screens/shared";
import { SLOT_COLORS } from "../screens/slotColors";

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("blends translucent colors onto the background", () => {
    expect(parseColor("rgba(255,253,238,0.5)").a).toBe(0.5);
    expect(contrastRatio("rgba(255,255,255,0)", "#06231D")).toBeCloseTo(1, 5);
  });
});

describe("theme contrast (WCAG AA)", () => {
  const backgrounds = { ink: C.ink, surface: C.surface, surface2: C.surface2 };

  it.each(Object.entries(backgrounds))("secondary text is readable on %s", (_name, bg) => {
    expect(contrastRatio(C.textDim, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(C.textFaint, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(C.mist, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("tappable outlines stand out from the surface", () => {
    expect(contrastRatio(C.lineControl, C.surface)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(C.lineControl, C.ink)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(Object.entries(SLOT_COLORS))("slot state %s has readable text", (_state, look) => {
    expect(contrastRatio(look.text, look.bg, C.ink)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(look.sub, look.bg, C.ink)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("free and selected slots have a visible outline", () => {
    expect(contrastRatio(SLOT_COLORS.free.border, SLOT_COLORS.free.bg, C.ink)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(SLOT_COLORS.selected.border, SLOT_COLORS.selected.bg, C.ink)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe("hasMoreToRight", () => {
  it("shows the scroll hint only while content extends past the edge", () => {
    expect(hasMoreToRight({ offsetX: 0, viewWidth: 300, contentWidth: 500 })).toBe(true);
    expect(hasMoreToRight({ offsetX: 200, viewWidth: 300, contentWidth: 500 })).toBe(false);
    expect(hasMoreToRight({ offsetX: 0, viewWidth: 300, contentWidth: 280 })).toBe(false);
  });
});
