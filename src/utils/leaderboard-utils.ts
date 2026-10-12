/** A leaderboard row with its place worked out. */
export type Ranked<T> = T & {
  /** Place on the leaderboard, 1 for the top. Players with the same Score share a place. */
  rank: number;
  /** True when at least one other player has the same Score, and so the same place. */
  tied: boolean;
};

/**
 * Orders leaderboard rows by Score, highest first, and gives each its place.
 * Players with the same Score share a place, and the next player takes the place their row
 * would have had (1, 2, 2, 4) - before this, tied players were numbered one after another in
 * whatever order they happened to load, so two players level on points showed as 2nd and 3rd.
 * Parameters: rows (anything with a monthlyPoints Score).
 * Returns: a new array, highest Score first, each row with its rank and whether it is tied.
 * Edge cases: an empty list returns an empty list; tied rows keep the order they came in; a
 * single row is rank 1 and not tied; the input array is not changed.
 */
export const rankByScore = <T extends { monthlyPoints: number }>(rows: T[]): Ranked<T>[] =>
  [...rows]
    .sort((a, b) => b.monthlyPoints - a.monthlyPoints)
    .map((row) => ({
      ...row,
      rank: 1 + rows.filter((other) => other.monthlyPoints > row.monthlyPoints).length,
      tied: rows.filter((other) => other.monthlyPoints === row.monthlyPoints).length > 1,
    }));

/**
 * Writes a leaderboard place the way the board shows it: a medal for the top three, "#4" below.
 * Parameters: rank (1 for the top).
 * Returns: the medal or the numbered place.
 * Edge cases: tied players pass the same rank and so get the same medal or number.
 */
export const rankLabel = (rank: number): string =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
