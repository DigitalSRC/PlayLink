/** The three calls a key-value store has to offer; AsyncStorage and Supabase's auth storage
 * both have this shape. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// The device's secure store limits one value to about 2 KB, and a saved session is larger, so
// it is saved in pieces. Well under the limit, because the limit is in bytes and this counts
// characters.
const CHUNK_SIZE = 1800;

// A count this high can only be a damaged entry; a real session is a handful of pieces.
const MAX_CHUNKS = 64;

// The secure store's keys may hold only letters, numbers, ".", "-", and "_".
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');

/**
 * Builds the storage the sign-in session is kept in on a phone: the device's secure store
 * (Keychain on iOS, Keystore-encrypted on Android) in place of AsyncStorage, which is a plain
 * file that a backup or a rooted phone can read. The secure store holds only small values, so
 * a value is split into numbered pieces with a count beside them.
 * Parameters: secure (the secure store's get/set/remove calls), legacy (optional: where the
 * session used to be kept; a session found there is moved across the first time it is read, so
 * nobody is signed out by the change).
 * Returns: a store with the same getItem/setItem/removeItem shape, for Supabase's auth client.
 * Edge cases: nothing here throws - a store that fails reads as "no session" and a failed save
 * is logged, so the worst case is being asked to sign in again, never a crash at startup. A
 * save first marks the entry empty, then writes the pieces, then the count, so a save cut short
 * leaves "no session" and never half of an old session joined to half of a new one. A missing
 * piece or a damaged count also reads as "no session". A legacy session is removed from the old
 * place only after it has been saved in the new one.
 */
export const makeChunkedSecureStorage = (
  secure: KeyValueStore,
  legacy?: KeyValueStore
): KeyValueStore => {
  const countKey = (key: string) => `${safeKey(key)}.n`;
  const chunkKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  const readCount = async (key: string): Promise<number> => {
    const count = Number(await secure.getItem(countKey(key)));
    return Number.isInteger(count) && count > 0 && count <= MAX_CHUNKS ? count : 0;
  };

  const readSecure = async (key: string): Promise<string | null> => {
    const count = await readCount(key);
    if (count === 0) return null;
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await secure.getItem(chunkKey(key, i));
      if (part == null) return null;
      value += part;
    }
    return value;
  };

  const writeSecure = async (key: string, value: string): Promise<void> => {
    const previous = await readCount(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    if (count > MAX_CHUNKS) throw new Error('Value is too large for the secure store.');
    await secure.setItem(countKey(key), '0');
    for (let i = 0; i < count; i++) {
      await secure.setItem(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    for (let i = count; i < previous; i++) await secure.removeItem(chunkKey(key, i));
    await secure.setItem(countKey(key), String(count));
  };

  const removeSecure = async (key: string): Promise<void> => {
    const count = await readCount(key);
    await secure.removeItem(countKey(key));
    for (let i = 0; i < count; i++) await secure.removeItem(chunkKey(key, i));
  };

  return {
    async getItem(key) {
      try {
        const value = await readSecure(key);
        if (value !== null || !legacy) return value;
        const old = await legacy.getItem(key);
        if (old === null) return null;
        try {
          await writeSecure(key, old);
          await legacy.removeItem(key);
        } catch (err) {
          console.warn('Could not move the saved session to the secure store:', err);
        }
        return old;
      } catch (err) {
        console.warn('Could not read the saved session:', err);
        return null;
      }
    },
    async setItem(key, value) {
      try {
        await writeSecure(key, value);
        if (legacy) await legacy.removeItem(key);
      } catch (err) {
        console.warn('Could not save the session:', err);
      }
    },
    async removeItem(key) {
      try {
        await removeSecure(key);
      } catch (err) {
        console.warn('Could not remove the saved session:', err);
      }
      try {
        if (legacy) await legacy.removeItem(key);
      } catch (err) {
        console.warn('Could not remove the older saved session:', err);
      }
    },
  };
};
