import { GameType, NoGoRule } from './types';

// id is now a Supabase auth UUID (profiles.id / group_players.player_id) rather than a
// locally-generated number, now that groups have real backend persistence (see
// supabase/migrations/20260705140000_create_groups.sql) instead of living only in client state.
export interface PlayerProfile {
  id: string;
  username: string;
  bracket: number;
  location: string;
  role: string;
}

export interface Group {
  id: string;
  name: string;
  joinCode: string;
  createdBy: string;
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

// HARDCODED_GROUPS (the static mock group list this file used to export on unitTests/
// test/<feature>) is gone as of the game-scoring feature: groups now have a real Supabase
// backend (see supabase/migrations/20260705140000_create_groups.sql and group-api.ts), so the
// mock data it stood in for no longer serves a purpose — its numeric ids aren't even compatible
// with the real UUID-based Group/PlayerProfile shape above. Anything wanting seed groups for
// manual testing should create real rows through the app (or group-api.ts directly) instead.
