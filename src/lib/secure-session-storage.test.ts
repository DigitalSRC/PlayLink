import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { KeyValueStore, makeChunkedSecureStorage } from "./secure-session-storage";

type FakeStore = KeyValueStore & { data: Map<string, string>; failOn?: (op: string, key: string) => boolean };

const makeStore = (): FakeStore => {
  const store: FakeStore = {
    data: new Map<string, string>(),
    async getItem(key) {
      if (store.failOn?.("get", key)) throw new Error("store unavailable");
      return store.data.has(key) ? (store.data.get(key) as string) : null;
    },
    async setItem(key, value) {
      if (store.failOn?.("set", key)) throw new Error("store unavailable");
      store.data.set(key, value);
    },
    async removeItem(key) {
      if (store.failOn?.("remove", key)) throw new Error("store unavailable");
      store.data.delete(key);
    },
  };
  return store;
};

const KEY = "sb-project-auth-token";
const session = (length: number) => "s".repeat(length - 1) + "E";

describe("makeChunkedSecureStorage", () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("reads back a short value exactly", async () => {
    const storage = makeChunkedSecureStorage(makeStore());
    await storage.setItem(KEY, "hello");
    expect(await storage.getItem(KEY)).toBe("hello");
  });

  it("splits a long value into pieces no larger than the secure store allows", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    const value = session(5000);
    await storage.setItem(KEY, value);
    expect(await storage.getItem(KEY)).toBe(value);
    expect(secure.data.get(`${KEY}.n`)).toBe("3");
    for (const [key, part] of secure.data) {
      if (!key.endsWith(".n")) expect(part.length).toBeLessThanOrEqual(1800);
    }
  });

  it("handles a value exactly one piece long", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    const value = session(1800);
    await storage.setItem(KEY, value);
    expect(secure.data.get(`${KEY}.n`)).toBe("1");
    expect(await storage.getItem(KEY)).toBe(value);
  });

  it("returns null when nothing was saved", async () => {
    expect(await makeChunkedSecureStorage(makeStore()).getItem(KEY)).toBeNull();
  });

  it("stores an empty value as no session", async () => {
    const storage = makeChunkedSecureStorage(makeStore());
    await storage.setItem(KEY, "");
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("clears leftover pieces when a shorter value replaces a longer one", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, session(5000));
    await storage.setItem(KEY, "short");
    expect(await storage.getItem(KEY)).toBe("short");
    expect([...secure.data.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
  });

  it("removes every piece", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, session(4000));
    await storage.removeItem(KEY);
    expect(secure.data.size).toBe(0);
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("keeps two keys apart", async () => {
    const storage = makeChunkedSecureStorage(makeStore());
    await storage.setItem("one", session(2500));
    await storage.setItem("two", "other");
    await storage.removeItem("one");
    expect(await storage.getItem("one")).toBeNull();
    expect(await storage.getItem("two")).toBe("other");
  });

  it("writes only keys the secure store accepts", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem("sb:project/auth token", "value");
    for (const key of secure.data.keys()) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(await storage.getItem("sb:project/auth token")).toBe("value");
  });

  it("reads as no session when a piece is missing", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, session(5000));
    secure.data.delete(`${KEY}.1`);
    expect(await storage.getItem(KEY)).toBeNull();
  });

  it("reads as no session when the count is damaged", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, "value");
    for (const bad of ["abc", "-1", "1.5", "999999", ""]) {
      secure.data.set(`${KEY}.n`, bad);
      expect(await storage.getItem(KEY)).toBeNull();
    }
  });

  it("leaves no session, not a mixed one, when a save is cut short", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, "A".repeat(5000));
    // The second piece of the new value cannot be written.
    secure.failOn = (op, key) => op === "set" && key === `${KEY}.1`;
    await storage.setItem(KEY, "B".repeat(5000));
    secure.failOn = undefined;
    expect(await storage.getItem(KEY)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("reads as no session, without throwing, when the secure store fails", async () => {
    const secure = makeStore();
    const storage = makeChunkedSecureStorage(secure);
    await storage.setItem(KEY, "value");
    secure.failOn = () => true;
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    await expect(storage.setItem(KEY, "again")).resolves.toBeUndefined();
    await expect(storage.removeItem(KEY)).resolves.toBeUndefined();
  });

  it("refuses a value too large to be a session and keeps nothing of it", async () => {
    const storage = makeChunkedSecureStorage(makeStore());
    await storage.setItem(KEY, "x".repeat(1800 * 64 + 1));
    expect(await storage.getItem(KEY)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  describe("with a session left in the older storage", () => {
    it("moves it across on first read and removes the old copy", async () => {
      const secure = makeStore();
      const legacy = makeStore();
      const value = session(4000);
      legacy.data.set(KEY, value);
      const storage = makeChunkedSecureStorage(secure, legacy);
      expect(await storage.getItem(KEY)).toBe(value);
      expect(legacy.data.has(KEY)).toBe(false);
      expect(await makeChunkedSecureStorage(secure).getItem(KEY)).toBe(value);
    });

    it("prefers the secure copy and leaves the older one unread", async () => {
      const secure = makeStore();
      const legacy = makeStore();
      legacy.data.set(KEY, "old");
      const storage = makeChunkedSecureStorage(secure, legacy);
      await storage.setItem(KEY, "new");
      expect(legacy.data.has(KEY)).toBe(false);
      expect(await storage.getItem(KEY)).toBe("new");
    });

    it("still returns the session, and keeps the old copy, when it cannot be moved", async () => {
      const secure = makeStore();
      const legacy = makeStore();
      legacy.data.set(KEY, "old");
      secure.failOn = (op) => op === "set";
      const storage = makeChunkedSecureStorage(secure, legacy);
      expect(await storage.getItem(KEY)).toBe("old");
      expect(legacy.data.get(KEY)).toBe("old");
    });

    it("returns null when neither place has one", async () => {
      expect(await makeChunkedSecureStorage(makeStore(), makeStore()).getItem(KEY)).toBeNull();
    });

    it("removes the session from both places at sign-out", async () => {
      const secure = makeStore();
      const legacy = makeStore();
      legacy.data.set(KEY, "old");
      const storage = makeChunkedSecureStorage(secure, legacy);
      await storage.removeItem(KEY);
      expect(legacy.data.has(KEY)).toBe(false);
      expect(await storage.getItem(KEY)).toBeNull();
    });

    it("still removes the older copy when the secure store fails at sign-out", async () => {
      const secure = makeStore();
      const legacy = makeStore();
      legacy.data.set(KEY, "old");
      secure.failOn = () => true;
      await makeChunkedSecureStorage(secure, legacy).removeItem(KEY);
      expect(legacy.data.has(KEY)).toBe(false);
    });
  });
});
