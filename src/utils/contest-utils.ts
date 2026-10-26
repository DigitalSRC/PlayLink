import { PlacementInput } from './scoring-utils';

/**
 * How long players have to agree with or contest a reported round (15 minutes).
 * The server sets each round's real deadline (submit_group_result in
 * 20261012130000_contest_window.sql); this copy is only for wording on screen.
 */
export const CONTEST_WINDOW_MS = 15 * 60 * 1000;

/** One player's vote on a round: the finish order they say is right. */
export interface Ballot {
  playerId: string;
  placements: PlacementInput[];
}

/** One distinct finish order among the votes, with who voted for it. */
export interface BallotOption {
  placements: PlacementInput[];
  voterIds: string[];
  /** True when this is the order the host reported. */
  isReport: boolean;
}

/**
 * Rewrites a finish order into one fixed form, so two reports of the same finish compare equal
 * whatever numbers or row order they were sent with: positions become competition ranks
 * (1, 2, 2, 4), ids are lower-cased, and rows are sorted by position and then id.
 * A hand-maintained copy of normalize_placements in 20261012130000_contest_window.sql - change
 * both together.
 * Parameters: placements (a finish order; extra fields on each entry are dropped).
 * Returns: the normalized order.
 * Edge cases: an empty order returns an empty array; tied players share the lower position and
 * the next player takes the position their row would have had.
 */
export const normalizePlacements = (placements: PlacementInput[]): PlacementInput[] =>
  placements
    .map((p) => ({
      playerId: p.playerId.toLowerCase(),
      placement: 1 + placements.filter((other) => other.placement < p.placement).length,
    }))
    .sort((a, b) => a.placement - b.placement || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));

/**
 * Turns a finish order into a string that is the same for every report of that finish.
 * Used to group votes and to tell whether a player's vote matches the host's report.
 * Parameters: placements (a finish order).
 * Returns: a key such as "1:a|2:b|2:c|4:d".
 * Edge cases: an empty order gives an empty string.
 */
export const orderKey = (placements: PlacementInput[]): string =>
  normalizePlacements(placements).map((p) => `${p.placement}:${p.playerId}`).join('|');

/**
 * Groups a round's votes by the finish order they are for, most votes first.
 * The host's reported order is always in the list, even if every vote for it has gone, because
 * it is what stands when nothing beats it.
 * Parameters: reported (the order the host reported), ballots (every vote cast, the host's
 * included).
 * Returns: one BallotOption per distinct order; the most-voted first, the report first among
 * equals.
 * Edge cases: no ballots returns just the report with no voters.
 */
export const tallyBallots = (reported: PlacementInput[], ballots: Ballot[]): BallotOption[] => {
  const reportKey = orderKey(reported);
  const options = new Map<string, BallotOption>();
  options.set(reportKey, { placements: normalizePlacements(reported), voterIds: [], isReport: true });
  for (const ballot of ballots) {
    const key = orderKey(ballot.placements);
    const option = options.get(key) ?? { placements: normalizePlacements(ballot.placements), voterIds: [], isReport: false };
    option.voterIds.push(ballot.playerId);
    options.set(key, option);
  }
  return [...options.values()].sort(
    (a, b) => b.voterIds.length - a.voterIds.length || Number(b.isReport) - Number(a.isReport)
  );
};

/**
 * Says which finish order would win if the round were settled now: the one with the most votes,
 * or the host's report when no single order leads.
 * A hand-maintained copy of the rule in settle_group_result (20261012130000_contest_window.sql);
 * the server decides for real, this is only so the app can show where a round stands.
 * Parameters: reported (the host's order), ballots (every vote cast).
 * Returns: the leading BallotOption.
 * Edge cases: no votes, a tie for the lead, or a tie between two challengers above the report
 * all return the report.
 */
export const leadingOrder = (reported: PlacementInput[], ballots: Ballot[]): BallotOption => {
  const options = tallyBallots(reported, ballots);
  const report = options.find((o) => o.isReport) as BallotOption;
  const top = options[0].voterIds.length;
  const leaders = options.filter((o) => o.voterIds.length === top);
  return leaders.length === 1 ? leaders[0] : report;
};

/**
 * How a player has voted on a round, for choosing what the group page shows them.
 * Parameters: reported (the host's order), ballots (every vote cast), playerId (the player).
 * Returns: 'none' if they have not voted, 'agreed' if their vote matches the report, or
 * 'contested' if they entered a different order.
 * Edge cases: the host's own ballot reads as 'agreed', since their report is their vote.
 */
export const voteStatus = (
  reported: PlacementInput[],
  ballots: Ballot[],
  playerId: string
): 'none' | 'agreed' | 'contested' => {
  const mine = ballots.find((b) => b.playerId.toLowerCase() === playerId.toLowerCase());
  if (!mine) return 'none';
  return orderKey(mine.placements) === orderKey(reported) ? 'agreed' : 'contested';
};

/**
 * Whole minutes left before a round's contest window ends, for the countdown on the group page.
 * Parameters: windowEndsAt (the deadline, in milliseconds), now (the current time, in milliseconds).
 * Returns: minutes left, rounded up, so the last few seconds still read "1 min"; 0 once it has ended.
 * Edge cases: a deadline in the past, or exactly now, gives 0.
 */
export const contestMinutesLeft = (windowEndsAt: number, now: number): number =>
  Math.max(0, Math.ceil((windowEndsAt - now) / 60000));
