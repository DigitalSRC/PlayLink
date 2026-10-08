/** The four one-time starter rewards. Matches `starter_rewards.reward_key` in the database. */
export type StarterRewardKey = 'create_group' | 'join_group' | 'view_calendar' | 'choose_rival';

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

/** The starter rewards in the order the Home tab lists them. */
export const STARTER_REWARDS: StarterReward[] = [
  { key: 'view_calendar', label: 'Look through the Calendar', hint: 'See game nights at stores near you.' },
  { key: 'create_group', label: 'Post a game', hint: 'Tap + Create on the Find tab, or Create game on a calendar event.' },
  { key: 'join_group', label: 'Join someone else’s game', hint: 'Pick a group on the Find tab, or enter a join code.' },
  { key: 'choose_rival', label: 'Pick your Rival', hint: 'Tap a contender’s badge on your Profile tab.' },
];
