import { GameType, NoGoRule } from './types';

export interface PlayerProfile {
  id: number;
  username: string;
  bracket: number;
  location: string;
  role: string;
}

export interface Group {
  id: number;
  name: string;
  joinCode: string;
  createdAt: number;
  scheduledAt?: number;
  roundsPlayed: number;
  players: PlayerProfile[];
  targetPlayers: number;
  brackets: number[];
  location: string;
  time: string;
  gameType: GameType;
  format: string;
  noGo: NoGoRule[];
  confirmed: boolean;
}

// HARDCODED_GROUPS (the static mock group list) has been removed from development/main — it's
// seed/test data, not shippable content, pending a real backend. It still lives on
// unitTests/test/<feature>; see CLAUDE.md git workflow. The Group/PlayerProfile types above
// stay everywhere since group-utils.ts, browse.tsx, and group-detail.tsx depend on them.
