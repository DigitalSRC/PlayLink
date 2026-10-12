import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { clearCachedPlayerData, persister } from "./query-client";

const CACHE_KEY = "playlink-query-cache";

describe("clearCachedPlayerData", () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it("empties the in-memory cache, whatever was in it", async () => {
    const client = new QueryClient();
    client.setQueryData(["profile", "user-1"], { username: "dave" });
    client.setQueryData(["groups"], [{ id: "g1" }]);
    client.setQueryData(["shop-purchases", "user-1"], ["title-kingmaker"]);

    await clearCachedPlayerData(client);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getQueryData(["groups"])).toBeUndefined();
  });

  it("removes the copy saved on the device, and nothing else stored there", async () => {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ clientState: { queries: [{ queryKey: ["groups"] }] } }));
    await AsyncStorage.setItem("something-else", "kept");

    await clearCachedPlayerData(new QueryClient());

    expect(await AsyncStorage.getItem(CACHE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem("something-else")).toBe("kept");
  });

  it("still empties the in-memory cache when the saved copy cannot be removed", async () => {
    jest.spyOn(persister, "removeClient").mockImplementation(async () => {
      throw new Error("storage unavailable");
    });
    const client = new QueryClient();
    client.setQueryData(["groups"], [{ id: "g1" }]);

    await expect(clearCachedPlayerData(client)).resolves.toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("is harmless on a cache that is already empty", async () => {
    await expect(clearCachedPlayerData(new QueryClient())).resolves.toBeUndefined();
  });
});
