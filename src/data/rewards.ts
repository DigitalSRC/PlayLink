/** The three one-time starter rewards. Matches `starter_rewards.reward_key` in the database. */
export type StarterRewardKey = 'first_group' | 'view_calendar' | 'choose_rival';

/**
 * What each starter reward is shown as worth. This is display copy only: the server decides the
 * real amount (see claim_starter_reward in 20261008130000_starter_rewards.sql) and a pop-up
 * always shows what the server actually paid. Change both together.
 */
export const STARTER_REWARD_POINTS = 25;

export interface StarterReward {
  key: StarterRewardKey;
  /** The task, as a short instruction. */
  label: string;
  /** Where to go to do it. */
  hint: string;
}

/**
 * The starter rewards in the order the Home tab lists them: 75 points in all. Posting a game
 * and joining one are a single reward - whichever a player does first completes it.
 */
export const STARTER_REWARDS: StarterReward[] = [
  { key: 'view_calendar', label: 'Look through the Calendar', hint: 'See game nights at stores near you.' },
  { key: 'first_group', label: 'Post a game or join one', hint: 'Use the Find tab, or tap Create game on a calendar event. Either one counts.' },
  { key: 'choose_rival', label: 'Pick your Rival', hint: 'Tap a contender’s badge on your Profile tab.' },
];
