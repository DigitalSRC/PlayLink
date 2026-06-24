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
  location: string;
  games: GameType[];
  preferredFormats: Partial<Record<GameType, string[]>>;
  bracket: number;
  noGo: NoGoRule[];
  wins: number;
  losses: number;
  xp: number;
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
