import { UserProfile } from '../data/types';

// Seed-profile id for Dillon Carroll, the always-present rival whose preferences are mirrored from the current user.
const DILLON_ID = 113;

/**
 * Computes a player's win rate as a fraction between 0 and 1.
 * Used internally to rank rival candidates by closeness of skill level to the current user.
 * Parameters: p (any UserProfile with wins and losses fields).
 * Returns: wins / (wins + losses), or 0.5 when the player has no recorded games.
 * Edge cases: returns 0.5 for a brand-new profile with zero games to avoid skewing the ranking.
 */
const winRate = (p: UserProfile): number => {
  const total = p.wins + p.losses;
  return total === 0 ? 0.5 : p.wins / total;
};

/**
 * Builds a version of Dillon Carroll whose games, formats, and brackets
 * mirror the current user so he always qualifies as a rival regardless of what they play.
 * His wins, losses, XP, and other identity fields remain unchanged.
 * Parameters: dillon (his base profile from seed-profiles), user (the current user).
 * Returns: a new UserProfile with Dillon's identity but the user's game preferences.
 * Edge cases: if the user has no brackets, falls back to Dillon's own bracket list.
 */
const buildDillonForUser = (dillon: UserProfile, user: UserProfile): UserProfile => ({
  ...dillon,
  games: [...user.games],
  preferredFormats: { ...user.preferredFormats },
  brackets: user.brackets.length > 0 ? [...user.brackets] : dillon.brackets,
});

/**
 * Finds up to maxRivals rival candidates for the current user.
 * Candidates are filtered to only profiles that share at least one game with the user,
 * then ranked by closeness of win rate. Dillon Carroll (id 113) is always injected
 * as the first result with his profile adapted to mirror the user's games.
 * Parameters: currentUser (the logged-in user), allProfiles (pool to match against), maxRivals (cap, default 3).
 * Returns: array of up to maxRivals profiles; Dillon is always index 0 when present in allProfiles.
 * Edge cases: if no game-matching profiles exist beyond Dillon, returns only Dillon; excludes currentUser by id.
 */
export const findRivals = (
  currentUser: UserProfile,
  allProfiles: UserProfile[],
  maxRivals: number = 3
): UserProfile[] => {
  const userRate = winRate(currentUser);
  const dillonBase = allProfiles.find((p) => p.id === DILLON_ID);

  const candidates = allProfiles.filter(
    (p) =>
      p.id !== currentUser.id &&
      p.id !== DILLON_ID &&
      p.games.some((g) => currentUser.games.includes(g))
  );

  const ranked = candidates
    .map((p) => ({ profile: p, diff: Math.abs(winRate(p) - userRate) }))
    .sort((a, b) => {
      if (Math.abs(a.diff - b.diff) < 0.001) return Math.random() - 0.5;
      return a.diff - b.diff;
    })
    .slice(0, dillonBase ? maxRivals - 1 : maxRivals)
    .map((r) => r.profile);

  if (dillonBase) {
    return [buildDillonForUser(dillonBase, currentUser), ...ranked];
  }

  return ranked;
};
