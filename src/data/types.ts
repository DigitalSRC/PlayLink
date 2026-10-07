export type GameType = 'mtg' | 'pokemon' | 'lorcana' | 'onepiece';

export type NoGoRule =
  | 'Infinites'
  | 'Extra Turns'
  | 'Game Changers'
  | 'Mill'
  | 'Stax'
  | 'Land Destruction';

export interface UserProfile {
  id: string;
  username: string;
  displayName?: string;
  isDeveloper?: boolean;
  location: string;
  games: GameType[];
  preferredFormats: Partial<Record<GameType, string[]>>;
  brackets: number[];
  noGo: NoGoRule[];
  wins: number;
  losses: number;
  draws: number;
  points: number;
  monthlyPoints: number;
  rivalIds?: string[];
  lastRivalRefresh?: string;
}

export const GAME_LABELS: Record<GameType, string> = {
  mtg: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
  lorcana: 'Disney Lorcana',
  onepiece: 'One Piece TCG',
};

export const GAME_EMOJI: Record<GameType, string> = {
  mtg: '⚔️',
  pokemon: '⚡',
  lorcana: '✨',
  onepiece: '☠️',
};

export const GAME_COLOR: Record<GameType, string> = {
  mtg: '#8B3A3A',
  pokemon: '#E6A817',
  lorcana: '#5B4FCF',
  onepiece: '#C0392B',
};

export const FORMAT_OPTIONS: Record<GameType, string[]> = {
  mtg: ['Commander', 'Standard', 'Draft', 'Modern', 'Pioneer'],
  pokemon: ['Standard', 'Expanded', 'Limited'],
  lorcana: ['Constructed', 'Draft'],
  onepiece: ['OP', 'Draft'],
};

// PlayLink is Commander-only for now. While this is true, every other game and every other Magic
// format is hidden and can't be picked anywhere in the app: onboarding skips the game step, the
// create-group form has no game or format pickers, the Find tab lists only Commander groups, and
// profiles show no game or format lists. Nothing is deleted - the other games' labels, colors,
// formats, and screens are all still here - so flipping this back to false restores them.
// Data saved before this was turned on (a profile's other games, a non-Commander group) is left
// alone in the database; it just isn't shown.
export const COMMANDER_ONLY = true;

export const COMMANDER_GAME: GameType = 'mtg';
export const COMMANDER_FORMAT = 'Commander';

const ALL_GAMES: GameType[] = ['mtg', 'pokemon', 'lorcana', 'onepiece'];

/** The games a player can currently pick from, in display order. */
export const SELECTABLE_GAMES: GameType[] = COMMANDER_ONLY ? [COMMANDER_GAME] : ALL_GAMES;

/**
 * Lists the formats a player can currently pick for a game. In Commander-only mode that is just
 * Commander, and only under Magic; otherwise it is the game's full format list.
 * Parameters: game (the game whose formats are wanted).
 * Returns: the format names that may be shown and chosen.
 * Edge cases: in Commander-only mode any game other than Magic returns an empty array.
 */
export const selectableFormats = (game: GameType): string[] => {
  if (!COMMANDER_ONLY) return FORMAT_OPTIONS[game];
  return game === COMMANDER_GAME ? [COMMANDER_FORMAT] : [];
};

/**
 * Narrows a player's list of games to the ones the app currently shows. In Commander-only mode
 * every player is treated as a Magic player whatever their profile says, so screens built around
 * "the games you play" (leaderboards, rival lines) still have exactly one game to work with.
 * Parameters: games (the games stored on a profile).
 * Returns: the games to display or iterate over.
 * Edge cases: in Commander-only mode returns ['mtg'] even for an empty list or a profile that
 * never picked Magic; with the mode off, returns the list unchanged.
 */
export const visibleGames = (games: GameType[]): GameType[] =>
  COMMANDER_ONLY ? [COMMANDER_GAME] : games;

/**
 * Decides whether a group belongs in what the app currently shows. In Commander-only mode that
 * means Magic Commander groups only, so a group of another game or format posted earlier never
 * appears in a list.
 * Parameters: gameType and format (the group's own values).
 * Returns: true if the group should be listed.
 * Edge cases: format is compared ignoring case and surrounding spaces; with the mode off every
 * group is in scope.
 */
export const isGroupInScope = (gameType: GameType, format: string): boolean =>
  !COMMANDER_ONLY ||
  (gameType === COMMANDER_GAME && format.trim().toLowerCase() === COMMANDER_FORMAT.toLowerCase());

export const NO_GO_OPTIONS: NoGoRule[] = [
  'Infinites',
  'Extra Turns',
  'Game Changers',
  'Mill',
  'Stax',
  'Land Destruction',
];

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

export type DayOfWeek = typeof DAYS_OF_WEEK[number];

// Generates all 96 legal time slots in 15-minute increments using a 12-hour AM/PM clock.
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const period = h < 12 ? 'AM' : 'PM';
      const hour = h % 12 === 0 ? 12 : h % 12;
      const minute = m === 0 ? '00' : String(m);
      slots.push(`${hour}:${minute} ${period}`);
    }
  }
  return slots;
})();

export const BRACKET_INFO: Record<number, { label: string; desc: string }> = {
  1: { label: 'Exhibition', desc: 'Precons only' },
  2: { label: 'Casual', desc: 'Minor upgrades' },
  3: { label: 'Upgraded', desc: 'Significant upgrades' },
  4: { label: 'Optimized', desc: 'Powerful synergies' },
  5: { label: 'cEDH', desc: 'Competitive' },
};
