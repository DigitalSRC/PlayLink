import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { shouldRefreshOnTabFocus } from '../utils/refresh-utils';
import { profileKeys } from './useProfileQueries';
import { rewardKeys } from './useRewardQueries';

/**
 * Marks everything other players can change as out of date, so whatever is on screen is
 * fetched again: the group list, any open group and its rounds, the player's own profile
 * (points arrive when a host reports a round), and their starter rewards.
 * Only queries a screen is currently showing are re-requested; the rest refetch when next shown.
 * Parameters: queryClient (the app's React Query client), userId (the signed-in player, if any).
 * Returns: a promise that settles once the visible queries have been fetched again.
 * Edge cases: with no userId only the group queries are refreshed; a failed fetch is left to
 * each query's own error state and does not reject this promise.
 */
export const refreshPlayerData = async (queryClient: QueryClient, userId: string | undefined): Promise<void> => {
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ['groups'] }),
    queryClient.invalidateQueries({ queryKey: ['group'] }),
    queryClient.invalidateQueries({ queryKey: ['group-results'] }),
    ...(userId
      ? [
          queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) }),
          queryClient.invalidateQueries({ queryKey: rewardKeys.claimed(userId) }),
        ]
      : []),
  ]);
};

/**
 * Gives a screen what its pull-to-refresh needs: whether a refresh is running, and the function
 * to start one. A refresh reloads the shared player data (refreshPlayerData), looks the
 * player's rivals up again (and searches for new ones if they have none), and runs the screen's
 * own extra reload, all at once.
 * Parameters: extra (optional; the screen's own reload, e.g. the Calendar's events).
 * Returns: { refreshing, onRefresh }.
 * Edge cases: a pull while a refresh is already running is ignored; a failure in any part
 * still ends the spinner, and that part's screen shows its own error as usual.
 */
export const usePullToRefresh = (extra?: () => Promise<unknown>) => {
  const queryClient = useQueryClient();
  const { session, refreshRivals } = useApp();
  const userId = session?.user.id;
  const [refreshing, setRefreshing] = useState(false);
  const runningRef = useRef(false);

  const onRefresh = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRefreshing(true);
    try {
      await Promise.allSettled([refreshPlayerData(queryClient, userId), refreshRivals(), extra?.()]);
    } finally {
      runningRef.current = false;
      setRefreshing(false);
    }
  }, [queryClient, userId, refreshRivals, extra]);

  return { refreshing, onRefresh };
};

/**
 * Returns the function the tab bar calls each time a tab is opened, so every tab shows fresh
 * groups, profile, and rivals without the player doing anything. Bursts are skipped: a tab
 * opened within a few seconds of the last refresh (see shouldRefreshOnTabFocus) reuses it.
 * Parameters: none; reads the session and refreshRivals from global context.
 * Returns: a function taking no arguments and returning nothing.
 * Edge cases: failures are left to each screen's own error state; nothing is thrown.
 */
export const useTabFocusRefresh = () => {
  const queryClient = useQueryClient();
  const { session, refreshRivals } = useApp();
  const userId = session?.user.id;
  const lastRef = useRef<number | null>(null);

  return useCallback(() => {
    const now = Date.now();
    if (!shouldRefreshOnTabFocus(lastRef.current, now)) return;
    lastRef.current = now;
    refreshPlayerData(queryClient, userId);
    refreshRivals();
  }, [queryClient, userId, refreshRivals]);
};
