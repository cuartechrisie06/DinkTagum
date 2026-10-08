import { isPresetAvatar, presetAvatarUrl, randomPresetSet } from "./avatars";

// Small deterministic generator so the test doesn't depend on Math.random.
function seeded(start) {
  let state = start;
  return () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
}

describe("preset avatars", () => {
  it("offers 5 women's and 5 men's icons with distinct hairstyles", () => {
    const { women, men } = randomPresetSet(seeded(42));
    expect(women).toHaveLength(5);
    expect(men).toHaveLength(5);
    const tops = (list) => list.map((a) => new URL(a.url).searchParams.get("top"));
    expect(new Set(tops(women)).size).toBe(5);
    expect(new Set(tops(men)).size).toBe(5);
    expect(new Set([...women, ...men].map((a) => a.url)).size).toBe(10);
  });

  it("gives women no facial hair and recognises preset URLs", () => {
    const url = presetAvatarUrl({ seed: "x", top: "bob", gender: "women" });
    expect(new URL(url).searchParams.get("facialHairProbability")).toBe("0");
    expect(isPresetAvatar(url)).toBe(true);
    expect(isPresetAvatar("https://example.supabase.co/storage/v1/object/public/avatars/a.jpg")).toBe(false);
  });

  it("draws a different set each time by default", () => {
    expect(randomPresetSet().women[0].url).not.toBe(randomPresetSet().women[0].url);
  });
});
