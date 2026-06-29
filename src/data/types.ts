export type GameType = 'mtg' | 'pokemon' | 'lorcana' | 'onepiece';

export type NoGoRule =
  | 'Infinites'
  | 'Extra Turns'
  | 'Game Changers'
  | 'Mill'
  | 'Stax'
  | 'Land Destruction';

export interface UserProfile {
  id: number;
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
  points: number;
  rivalIds?: number[];
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
