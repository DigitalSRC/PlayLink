import { CryptoDigestAlgorithm, digest, getRandomValues } from 'expo-crypto';

const DIGEST_ALGORITHM_MAP: Record<string, CryptoDigestAlgorithm> = {
  'SHA-1': CryptoDigestAlgorithm.SHA1,
  'SHA-256': CryptoDigestAlgorithm.SHA256,
  'SHA-384': CryptoDigestAlgorithm.SHA384,
  'SHA-512': CryptoDigestAlgorithm.SHA512,
};

const subtleDigest = (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
  const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
  const mapped = DIGEST_ALGORITHM_MAP[name];
  if (!mapped) throw new Error(`crypto-polyfill: unsupported digest algorithm "${name}"`);
  return digest(mapped, data);
};

/**
 * Polyfills `crypto.subtle.digest` (and `crypto.getRandomValues`, if that's missing too) using
 * expo-crypto's native implementations. React Native's JS runtime (Hermes) has no built-in
 * SubtleCrypto, so Supabase's auth-js — which hashes its PKCE code verifier with
 * `crypto.subtle.digest('SHA-256', ...)` for every signUp/signIn call, not just OAuth — silently
 * falls back to sending the unhashed verifier as the "plain" code challenge method, logging
 * "WebCrypto API is not supported. Code challenge method will default to use plain instead of
 * sha256." This has no bearing on password storage (Supabase hashes passwords server-side
 * regardless of this warning), but it does weaken the PKCE exchange itself, so it's worth closing.
 * expo-crypto's `digest()`/`getRandomValues()` match the Web Crypto API's signatures closely
 * enough to drop in directly.
 *
 * Must polyfill both together, not just `subtle`: auth-js's own verifier generator
 * (generatePKCEVerifier) branches on `typeof crypto === 'undefined'` — if `crypto` didn't exist
 * at all and this only added a bare `{ subtle }` stub, that branch would flip from "crypto
 * missing, use a Math.random fallback" to "crypto present" and then call the now-missing
 * `crypto.getRandomValues`, throwing "undefined is not a function" and breaking sign-up/sign-in
 * outright — worse than the warning this was meant to fix.
 * Parameters: none — this module's import is its side effect.
 * Returns: void.
 * Edge cases: only patches whichever of `subtle`/`getRandomValues` is actually missing (a real
 * browser/web environment already has both and is left untouched); only SHA-1/256/384/512 are
 * mapped for digest since those are the only algorithms auth-js ever requests.
 */
const applyCryptoPolyfill = (): void => {
  // Typed as Partial: the ambient Crypto type declares both members as always present, but the
  // whole point here is that a real RN runtime may not actually have either one.
  const existing = globalThis.crypto as Partial<Crypto> | undefined;
  if (existing?.subtle && existing.getRandomValues) return;

  const patched: Crypto = {
    ...(existing ?? {}),
    getRandomValues: existing?.getRandomValues ?? (getRandomValues as unknown as Crypto['getRandomValues']),
    subtle: existing?.subtle ?? ({ digest: subtleDigest } as SubtleCrypto),
  } as Crypto;

  (globalThis as { crypto: Crypto }).crypto = patched;
};

applyCryptoPolyfill();
