// Shared by the Edge Functions that are called by pg_cron with a shared secret instead of a
// player's sign-in (refresh-rivals, sync-local-events). No Deno APIs here, so it is
// unit-testable from the app's Jest setup like the other pure function helpers.

/**
 * Says whether the secret a caller sent matches the one the function expects, taking the same
 * time whether the first character is wrong or the last. A plain `===` stops at the first
 * difference, which lets a patient caller learn a secret one character at a time by measuring
 * how long each refusal takes.
 * Parameters: provided (what the caller sent, e.g. the x-cron-secret header; may be missing),
 * expected (the configured secret; may be missing if the function was never given one).
 * Returns: true only when both are present, non-empty, and identical.
 * Edge cases: returns false when either value is missing or empty, so a function with no
 * secret configured refuses every caller instead of accepting a blank one; values of different
 * lengths are compared over the longer length and always return false.
 */
export const secretsMatch = (
  provided: string | null | undefined,
  expected: string | null | undefined
): boolean => {
  if (!provided || !expected) return false;
  // Character codes, not an encoder: this file has to run under Deno and under the app's test
  // runner, and two strings are identical exactly when their character codes are.
  let difference = provided.length ^ expected.length;
  const length = Math.max(provided.length, expected.length);
  for (let i = 0; i < length; i++) {
    // Past the end of a string charCodeAt gives NaN, which `| 0` turns into 0.
    difference |= (provided.charCodeAt(i) | 0) ^ (expected.charCodeAt(i) | 0);
  }
  return difference === 0;
};
