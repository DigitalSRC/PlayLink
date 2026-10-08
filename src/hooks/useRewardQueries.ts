import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { showToast } from '../components/AppToast';
import { STARTER_REWARDS, StarterRewardKey } from '../data/rewards';
import { claimStarterReward, fetchStarterRewards } from '../lib/reward-api';
import { profileKeys } from './useProfileQueries';

/**
 * Query key factory for starter-reward data.
 * Parameters: claimed() takes the signed-in player's id, so one player's rewards are never
 * served from the cache to the next person who signs in on the same phone.
 * Returns: the per-player key.
 * Edge cases: userId may be undefined while the session loads; the query is gated with `enabled`.
 */
export const rewardKeys = {
  claimed: (userId: string | undefined) => ['starter-rewards', userId] as const,
};

/**
 * Fetches and caches which starter rewards the signed-in player has already been paid.
 * Parameters: userId (the signed-in player's id, or undefined while the session is loading).
 * Returns: the standard React Query result; `data` is an array of reward keys.
 * Edge cases: disabled while userId is undefined; does not retry on failure, since the usual
 * failure is that the server doesn't have starter rewards yet, and screens then hide them.
 */
export const useStarterRewardsQuery = (userId: string | undefined) =>
  useQuery({
    queryKey: rewardKeys.claimed(userId),
    queryFn: fetchStarterRewards,
    enabled: !!userId,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

/**
 * Returns a function screens call right after a player does one of the starter tasks. It asks
 * the server for the reward; if points were paid it refreshes the player's profile and reward
 * list and shows a short message saying what they earned.
 * It is deliberately quiet about everything else: a reward already held, a task the server
 * says wasn't done, or a server without starter rewards all end with nothing shown, because
 * none of them should interrupt the thing the player was actually doing.
 * Parameters: userId (the signed-in player's id, or undefined while the session is loading).
 * Returns: claim(key), which resolves once the request has finished either way.
 * Edge cases: does nothing with no userId; skips the request when the cached list already has
 * the reward; never throws - a failure is logged and swallowed; the server pays each reward at
 * most once, so calling this repeatedly (every time the Calendar opens, say) is safe.
 */
export const useClaimStarterReward = (userId: string | undefined) => {
  const queryClient = useQueryClient();
  return useCallback(
    async (key: StarterRewardKey): Promise<void> => {
      if (!userId) return;
      const cached = queryClient.getQueryData<StarterRewardKey[]>(rewardKeys.claimed(userId));
      if (cached?.includes(key)) return;
      try {
        const paid = await claimStarterReward(key);
        queryClient.setQueryData<StarterRewardKey[]>(rewardKeys.claimed(userId), (prev) =>
          prev?.includes(key) ? prev : [...(prev ?? []), key]
        );
        if (paid > 0) {
          queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
          const task = STARTER_REWARDS.find((r) => r.key === key)?.label ?? 'Getting started';
          showToast(`+${paid} points`, `${task}: done. They’re yours to spend in the Shop.`);
        }
      } catch (err) {
        console.warn(`Starter reward ${key} not claimed:`, err);
      }
    },
    [queryClient, userId]
  );
};
