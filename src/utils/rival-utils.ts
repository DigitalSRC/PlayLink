import { UserProfile } from '../data/types';

// Seed-profile id for Dillon Carroll, the always-present rival whose preferences are mirrored
// from the current user. Stored as a string to match UserProfile.id (now a Supabase auth UUID
// as of the `database` branch). On this branch RIVAL_POOL is always empty (see
// profile-creation.tsx), so this constant is inert here — it exists purely so this file
// type-checks against the new string id. rival-system's copy of this file (and
// seed-profiles.ts) still uses the numeric id 113 and will conflict with this line when
// rival-system is eventually merged into development — that conflict is expected; resolve it
// by migrating rival-system's seed ids to UUIDs at that time, not by reverting this branch.
const DILLON_ID = '113';

/**
 * Computes how far apart two players' monthly points are.
 * Used internally to rank rival candidates by closeness of *current-season* standing to the
 * current user, rather than lifetime record, since monthlyPoints is what the leaderboard sorts
 * by and what resets to 0 for everyone at the start of each month.
 * Parameters: a, b (any two UserProfiles with monthlyPoints fields).
 * Returns: the absolute difference between the two players' monthlyPoints.
 * Edge cases: two players who both have 0 monthlyPoints (e.g. right after a monthly reset)
 * are treated as a perfect match (distance 0), which is intentional — a fresh season should
 * still be able to pair up rivals immediately rather than waiting for points to accrue.
 */
const monthlyPointsDistance = (a: UserProfile, b: UserProfile): number =>
  Math.abs(a.monthlyPoints - b.monthlyPoints);

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
 * then ranked by closeness of monthly points — the same metric the leaderboard sorts by,
 * so a rival match stays aligned with the current month's standings and reshuffles along
 * with everyone else's fresh start when monthlyPoints resets. Dillon Carroll (id 113) is
 * always injected as the first result with his profile adapted to mirror the user's games.
 * Parameters: currentUser (the logged-in user), allProfiles (pool to match against), maxRivals (cap, default 3).
 * Returns: array of up to maxRivals profiles; Dillon is always index 0 when present in allProfiles.
 * Edge cases: if no game-matching profiles exist beyond Dillon, returns only Dillon; excludes currentUser by id.
 */
export const findRivals = (
  currentUser: UserProfile,
  allProfiles: UserProfile[],
  maxRivals: number = 3
): UserProfile[] => {
  const dillonBase = allProfiles.find((p) => p.id === DILLON_ID);

  const candidates = allProfiles.filter(
    (p) =>
      p.id !== currentUser.id &&
      p.id !== DILLON_ID &&
      p.games.some((g) => currentUser.games.includes(g))
  );

  const ranked = candidates
    .map((p) => ({ profile: p, diff: monthlyPointsDistance(currentUser, p) }))
    .sort((a, b) => {
      if (a.diff === b.diff) return Math.random() - 0.5;
      return a.diff - b.diff;
    })
    .slice(0, dillonBase ? maxRivals - 1 : maxRivals)
    .map((r) => r.profile);

  if (dillonBase) {
    return [buildDillonForUser(dillonBase, currentUser), ...ranked];
  }

  return ranked;
};
