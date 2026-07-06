import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA1: "SHA1", SHA256: "SHA256", SHA384: "SHA384", SHA512: "SHA512" },
  digest: jest.fn(async () => new ArrayBuffer(32)),
  getRandomValues: jest.fn((arr: Uint32Array) => arr),
}));

const setGlobalCrypto = (value: unknown) => {
  Object.defineProperty(globalThis, "crypto", { value, configurable: true, writable: true });
};

describe("crypto-polyfill", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    setGlobalCrypto(originalCrypto);
    jest.resetModules();
  });

  it("polyfills both getRandomValues and subtle.digest when crypto is entirely missing", () => {
    // @ts-expect-error deliberately simulating a runtime with no crypto global at all
    delete globalThis.crypto;
    jest.resetModules();
    require("./crypto-polyfill");

    expect(globalThis.crypto).toBeDefined();
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
    expect(typeof globalThis.crypto.subtle.digest).toBe("function");
  });

  // Regression test for the exact bug: an earlier version of this polyfill only added a bare
  // { subtle } object when crypto was missing, which made auth-js's generatePKCEVerifier think
  // crypto existed and call the still-missing crypto.getRandomValues, throwing "undefined is not
  // a function" and breaking every sign-up/sign-in. Calling getRandomValues here must not throw.
  it("never leaves getRandomValues missing on a patched crypto object (regression)", () => {
    // @ts-expect-error deliberately simulating a runtime with no crypto global at all
    delete globalThis.crypto;
    jest.resetModules();
    require("./crypto-polyfill");

    expect(() => globalThis.crypto.getRandomValues(new Uint32Array(4))).not.toThrow();
  });

  it("leaves an already-complete crypto implementation untouched", () => {
    const fakeSubtle = { digest: jest.fn() };
    const fakeGetRandomValues = jest.fn();
    setGlobalCrypto({ subtle: fakeSubtle, getRandomValues: fakeGetRandomValues });
    jest.resetModules();
    require("./crypto-polyfill");

    expect(globalThis.crypto.subtle).toBe(fakeSubtle);
    expect(globalThis.crypto.getRandomValues).toBe(fakeGetRandomValues);
  });

  it("subtle.digest resolves via expo-crypto's digest for a mapped algorithm", async () => {
    // @ts-expect-error deliberately simulating a runtime with no crypto global at all
    delete globalThis.crypto;
    jest.resetModules();
    require("./crypto-polyfill");

    const result = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3]));
    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it("subtle.digest rejects an unmapped algorithm name instead of silently returning garbage", async () => {
    // @ts-expect-error deliberately simulating a runtime with no crypto global at all
    delete globalThis.crypto;
    jest.resetModules();
    require("./crypto-polyfill");

    await expect(
      globalThis.crypto.subtle.digest("MD5", new Uint8Array([1, 2, 3]))
    ).rejects.toThrow(/unsupported digest algorithm/);
  });
});
