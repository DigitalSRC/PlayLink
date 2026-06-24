import { UserProfile } from '../data/types';

const winRate = (p: UserProfile): number => {
  const total = p.wins + p.losses;
  return total === 0 ? 0.5 : p.wins / total;
};

/**
 * Finds rivals for the current user by matching closest win rate.
 * Candidates are sorted by absolute difference in win rate from the current user.
 * When multiple candidates share the same closest diff, they are shuffled randomly.
 * Parameters: currentUser (the logged-in user), allProfiles (pool to match against), maxRivals (cap, default 3).
 * Returns: up to maxRivals profiles with the closest win rates.
 * Edge cases: returns empty array when allProfiles is empty; excludes the current user by id.
 */
export const findRivals = (
  currentUser: UserProfile,
  allProfiles: UserProfile[],
  maxRivals: number = 3
): UserProfile[] => {
  const userRate = winRate(currentUser);

  const ranked = allProfiles
    .filter((p) => p.id !== currentUser.id)
    .map((p) => ({ profile: p, diff: Math.abs(winRate(p) - userRate) }))
    .sort((a, b) => {
      if (Math.abs(a.diff - b.diff) < 0.001) return Math.random() - 0.5;
      return a.diff - b.diff;
    });

  return ranked.slice(0, maxRivals).map((r) => r.profile);
};
