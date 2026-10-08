// Ready-made profile icons in the same DiceBear "avataaars" cartoon style the
// app already uses for players. Each icon is just a URL, saved to
// profiles.avatar_url like an uploaded photo, so no storage or upload needed.

const BASE = "https://api.dicebear.com/9.x/avataaars/png";

// Hairstyles that read clearly as feminine / masculine (all verified valid).
const WOMEN_TOPS = ["longButNotTooLong", "bob", "curvy", "straight01", "straight02", "bigHair", "miaWallace", "straightAndStrand", "bun", "frida"];
const MEN_TOPS = ["shortFlat", "shortWaved", "shortCurly", "theCaesar", "theCaesarAndSidePart", "shortRound", "sides", "dreads01", "frizzle", "shaggy"];

export const PRESETS_PER_GROUP = 5;

export function presetAvatarUrl({ seed, top, gender }) {
  const params = new URLSearchParams({
    seed,
    top,
    size: "256",
    backgroundColor: "0f3e33", // the app's surface green
    // Friendly expressions only; the style's defaults include scowls.
    eyes: "default,happy,wink,squint",
    eyebrows: "default,defaultNatural,raisedExcited,raisedExcitedNatural",
    mouth: "smile,default,twinkle",
    facialHairProbability: gender === "women" ? "0" : "35",
  });
  return `${BASE}?${params.toString()}`;
}

export function isPresetAvatar(url) {
  return typeof url === "string" && url.startsWith(BASE);
}

function pick(list, count, random) {
  const pool = list.slice();
  const chosen = [];
  while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return chosen;
}

// 5 women's and 5 men's icons with distinct hairstyles and random faces.
// Pass `random` for deterministic tests.
export function randomPresetSet(random = Math.random) {
  const make = (gender, tops) => pick(tops, PRESETS_PER_GROUP, random).map((top) => {
    const seed = `${gender}-${top}-${Math.floor(random() * 1e9).toString(36)}`;
    return { id: seed, gender, url: presetAvatarUrl({ seed, top, gender }) };
  });
  return { women: make("women", WOMEN_TOPS), men: make("men", MEN_TOPS) };
}
