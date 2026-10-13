// SQLSTATE that Postgres gives an error raised on purpose by one of our own functions or
// triggers (`raise exception '...'`). Those messages are written for the player.
const RAISED_ON_PURPOSE = 'P0001';

// A five-character SQLSTATE ("42501", "23505") or one of the API layer's own codes ("PGRST116").
const DATABASE_CODE = /^([0-9A-Z]{5}|PGRST\d+)$/;

/**
 * Chooses what to tell a player when something they did failed. The server's own refusals are
 * written in plain English and are shown as they are ("This group is full."), but an error the
 * database produced by itself ("permission denied for table groups", "duplicate key value
 * violates unique constraint ...") names tables and rules that mean nothing to a player and
 * describe the back end to anyone probing it, so those are replaced by the fallback.
 * Parameters: err (whatever was thrown), fallback (what to say instead of a database message,
 * or when the error has no message at all).
 * Returns: the sentence to show.
 * Edge cases: an error with no code (a network failure, a sign-in error from the auth service,
 * an Error thrown by the app itself) keeps its own message; a blank message returns the
 * fallback; never throws, whatever is passed in - a string, null, or undefined gives the fallback.
 */
export const playerErrorMessage = (err: unknown, fallback: string): string => {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    code?: unknown;
    message?: unknown;
  };
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (message === '') return fallback;
  if (typeof e.code === 'string' && e.code !== RAISED_ON_PURPOSE && DATABASE_CODE.test(e.code)) {
    return fallback;
  }
  return message;
};
