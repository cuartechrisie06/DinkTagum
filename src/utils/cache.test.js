import AsyncStorage from "@react-native-async-storage/async-storage";
import { cacheKey, readCache, savedAgoLabel, writeCache } from "./cache";

beforeEach(() => AsyncStorage.clear());

describe("offline cache", () => {
  it("round-trips data per user", async () => {
    await writeCache("dashboard", "u1", { courts: [1, 2] }, 1000);
    expect(await readCache("dashboard", "u1")).toEqual({ data: { courts: [1, 2] }, savedAt: 1000 });
    expect(await readCache("dashboard", "u2")).toBeNull();
  });

  it("ignores corrupt entries instead of throwing", async () => {
    await AsyncStorage.setItem(cacheKey("dashboard", "u1"), "{not json");
    expect(await readCache("dashboard", "u1")).toBeNull();
  });

  it("survives storage failures", async () => {
    const spy = jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("disk"));
    expect(await readCache("dashboard", "u1")).toBeNull();
    spy.mockRestore();
  });
});

describe("savedAgoLabel", () => {
  it("describes how old the cache is", () => {
    const now = 10 * 24 * 3600 * 1000;
    expect(savedAgoLabel(now - 10 * 1000, now)).toBe("just now");
    expect(savedAgoLabel(now - 5 * 60000, now)).toBe("5 min ago");
    expect(savedAgoLabel(now - 3 * 3600000, now)).toBe("3 h ago");
    expect(savedAgoLabel(now - 24 * 3600000, now)).toBe("1 day ago");
  });
});
