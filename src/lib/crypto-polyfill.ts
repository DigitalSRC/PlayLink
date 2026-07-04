import { CryptoDigestAlgorithm, digest } from 'expo-crypto';

const DIGEST_ALGORITHM_MAP: Record<string, CryptoDigestAlgorithm> = {
  'SHA-1': CryptoDigestAlgorithm.SHA1,
  'SHA-256': CryptoDigestAlgorithm.SHA256,
  'SHA-384': CryptoDigestAlgorithm.SHA384,
  'SHA-512': CryptoDigestAlgorithm.SHA512,
};

/**
 * Polyfills `crypto.subtle.digest` using expo-crypto's native implementation. React Native's
 * JS runtime (Hermes) has no built-in SubtleCrypto, so Supabase's auth-js — which hashes its
 * PKCE code verifier with `crypto.subtle.digest('SHA-256', ...)` for every signUp/signIn call,
 * not just OAuth — silently falls back to sending the unhashed verifier as the "plain" code
 * challenge method, logging "WebCrypto API is not supported. Code challenge method will
 * default to use plain instead of sha256." This has no bearing on password storage (Supabase
 * hashes passwords server-side regardless), but it does weaken the PKCE exchange itself, so
 * it's worth closing. expo-crypto's `digest()` matches SubtleCrypto.digest's signature closely
 * enough (same algorithm-name-to-BufferSource-to-Promise<ArrayBuffer> shape) to drop in directly.
 * Parameters: none — this module's import is its side effect.
 * Returns: void.
 * Edge cases: only patches `crypto.subtle` when it's actually missing (real browser/web
 * environments already have a native implementation and are left untouched); only SHA-1/256/
 * 384/512 are mapped since those are the only digest algorithms auth-js ever requests.
 */
const applyCryptoSubtlePolyfill = (): void => {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.subtle) return;

  const subtle = {
    digest: (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const mapped = DIGEST_ALGORITHM_MAP[name];
      if (!mapped) throw new Error(`crypto-polyfill: unsupported digest algorithm "${name}"`);
      return digest(mapped, data);
    },
  } as SubtleCrypto;

  if (globalCrypto) {
    (globalCrypto as { subtle: SubtleCrypto }).subtle = subtle;
  } else {
    (globalThis as { crypto: Crypto }).crypto = { subtle } as Crypto;
  }
};

applyCryptoSubtlePolyfill();
