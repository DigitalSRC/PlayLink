import { supabase } from './supabase';
import { StarterRewardKey } from '../data/rewards';

/**
 * Fetches which starter rewards the signed-in player has already been paid. Row-level security
 * returns only the caller's own rows, so no player id needs to be (or can usefully be) passed.
 * Parameters: none.
 * Returns: the keys of the rewards already claimed.
 * Edge cases: returns an empty array for a player who has claimed nothing; throws on a
 * Postgres/network error, including when the starter_rewards table doesn't exist yet (the
 * migration hasn't been applied) - callers treat that as "rewards aren't available".
 */
export const fetchStarterRewards = async (): Promise<StarterRewardKey[]> => {
  const { data, error } = await supabase.from('starter_rewards').select('reward_key');
  if (error) throw error;
  return (data as { reward_key: StarterRewardKey }[]).map((row) => row.reward_key);
};

/**
 * Asks the server to pay one starter reward, through the claim_starter_reward SQL function. The
 * server checks the task was really done where it can, fixes the amount itself, and pays each
 * reward at most once per player.
 * Parameters: key (which reward).
 * Returns: the points paid by this call - the reward's value the first time, 0 if the player
 * already had it.
 * Edge cases: throws with the server's own message if the task hasn't been done ("Post a group
 * first"), the player has no rivals to choose from, or they aren't signed in; asking again for a
 * reward already held is safe and returns 0.
 */
export const claimStarterReward = async (key: StarterRewardKey): Promise<number> => {
  const { data, error } = await supabase.rpc('claim_starter_reward', { p_key: key });
  if (error) throw error;
  return (data as number) ?? 0;
};
