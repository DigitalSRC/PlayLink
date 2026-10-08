export type GameOutcome = 'win' | 'loss' | 'draw';

export interface PlacementInput {
  playerId: string;
  /** 1-indexed rank, best first. Ties are allowed — two players sharing a placement value are
   * treated as drawing that rank, not as one beating the other. */
  placement: number;
}

export interface PlacementResult {
  playerId: string;
  placement: number;
  outcome: GameOutcome;
  /** Total points earned for this round: placement bonus (0 for last place) plus the flat
   * participation bonus every player gets regardless of standing. */
  pointsAwarded: number;
}

/** Flat bonus every participant earns just for playing a round, regardless of standing. */
export const PARTICIPATION_POINTS = 10;

/**
 * Computes each player's points and win/loss/draw outcome for one reported round, given their
 * placements (1st, 2nd, ...). The winner's base point pool scales with pod size — 10 points per
 * opponent beaten — and each subsequent distinct rank earns half of the rank before it, so 2nd
 * gets half of 1st, 3rd gets half of 2nd, and so on. Whichever distinct rank is last (highest
 * placement number) always scores zero placement points, overriding whatever the halving formula
 * would have given it — matching "the player who lost first or came last scores no points"
 * literally rather than approximately. Every player, including last place, still earns the flat
 * PARTICIPATION_POINTS on top. Players who share a placement value are scored identically for
 * that rank and reported as a 'draw', even if the tied rank happens to also be the last one.
 * Parameters: placements (one entry per participant; order doesn't matter, only placement values do).
 * Returns: one PlacementResult per input entry, in the same order as the input.
 * Edge cases: an empty input returns an empty array; a single-player "game" (not a real scenario
 * this app allows, but not rejected here either) scores that player a win worth just the
 * participation bonus, since there's no opponent to beat.
 */
export const computePlacementScores = (placements: PlacementInput[]): PlacementResult[] => {
  if (placements.length === 0) return [];

  const winnerBasePoints = 10 * (placements.length - 1);
  const distinctRanks = Array.from(new Set(placements.map((p) => p.placement))).sort((a, b) => a - b);
  const lastRank = distinctRanks[distinctRanks.length - 1];

  const pointsByRank = new Map<number, number>(
    distinctRanks.map((rank, index) => [
      rank,
      rank === lastRank ? 0 : Math.round(winnerBasePoints / 2 ** index),
    ])
  );

  return placements.map((p) => {
    const tiedCount = placements.filter((other) => other.placement === p.placement).length;
    const isSoleTop = p.placement === distinctRanks[0] && tiedCount === 1;
    const isSoleBottom = p.placement === lastRank && tiedCount === 1 && distinctRanks.length > 1;

    const outcome: GameOutcome = isSoleTop ? 'win' : isSoleBottom ? 'loss' : 'draw';

    return {
      playerId: p.playerId,
      placement: p.placement,
      outcome,
      pointsAwarded: (pointsByRank.get(p.placement) ?? 0) + PARTICIPATION_POINTS,
    };
  });
};
