// WCAG 2.x contrast helpers. Colors are "#RRGGBB" or "rgba(r,g,b,a)"; a
// translucent foreground is blended onto the (opaque) background first, which
// is how the theme's rgba text tokens actually render.

export function parseColor(value) {
  const text = String(value).trim();
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(text);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (rgba) return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
  throw new Error(`Unsupported color: ${value}`);
}

export function blend(fg, bg) {
  const f = parseColor(fg);
  const b = parseColor(bg);
  const mix = (x, y) => x * f.a + y * (1 - f.a);
  return { r: mix(f.r, b.r), g: mix(f.g, b.g), b: mix(f.b, b.b), a: 1 };
}

function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Contrast ratio of `fg` drawn on `bg` (1–21). `bg` may itself be translucent
// over `base` (e.g. a tinted slot drawn on the page background).
export function contrastRatio(fg, bg, base) {
  const background = base ? blend(bg, base) : parseColor(bg);
  const backgroundCss = `rgba(${background.r},${background.g},${background.b},1)`;
  const a = luminance(blend(fg, backgroundCss));
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// AA: 4.5 for body text, 3 for large text and UI component boundaries.
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
