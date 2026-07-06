import { GameType, NoGoRule } from './types';

// id is now a Supabase auth UUID (profiles.id / group_players.player_id) rather than a
// locally-generated number, now that groups have real backend persistence (see
// supabase/migrations/20260705140000_create_groups.sql) instead of living only in client state.
export interface PlayerProfile {
  id: string;
  username: string;
  displayName?: string;
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

// HARDCODED_GROUPS (the static mock group list) has been removed from development/main — it's
// seed/test data, not shippable content, and now also predates the real backend below (its ids
// are numeric, not UUIDs). It still lives on unitTests/test/<feature>; see CLAUDE.md git
// workflow. The Group/PlayerProfile types above stay everywhere since group-utils.ts,
// browse.tsx, group-detail.tsx, and group-api.ts all depend on them.
