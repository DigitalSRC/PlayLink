import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single React Query client used across the app for all Supabase-backed data.
 * `staleTime` of 30 seconds means a screen re-mount within that window renders straight from
 * cache with no network request; `gcTime` of one day keeps cached data around in memory (and,
 * via the persister below, on disk) well past a typical app restart so cold starts still have
 * something to show immediately.
 * Parameters: none.
 * Returns: not applicable — this is a module-level singleton, not a function.
 * Edge cases: none — default options apply to every query/mutation unless a call site overrides them.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: ONE_DAY_MS,
    },
  },
});

/**
 * Persists the React Query cache to AsyncStorage so the last-known data (e.g. the signed-in
 * user's profile) renders instantly on a cold app start, before any network request completes.
 * Parameters: none.
 * Returns: not applicable — this is a module-level singleton, not a function.
 * Edge cases: none — AsyncStorage read/write failures are handled internally by the persister
 * library and simply fall back to an empty cache rather than throwing.
 */
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'playlink-query-cache',
});
