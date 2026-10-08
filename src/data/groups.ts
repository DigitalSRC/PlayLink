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
  /** What this player is wearing from the shop, if anything (see src/data/shop.ts). */
  title?: string;
  nameColor?: string;
}

export interface Group {
  id: string;
  name: string;
  joinCode: string;
  // Undefined for a store-sourced group (source === 'store'), which has no host player at all -
  // never undefined for a player-created group.
  createdBy?: string;
  createdAt: number;
  scheduledAt?: number;
  /** The calendar day the host picked, "YYYY-MM-DD" as it read on their phone. A player can be
   * in one group per day, and this is the day that rule counts. Absent on groups posted before
   * the column existed; use groupDayKey() rather than reading it directly. */
  playDate?: string;
  /** The event area (an event_areas id) the host was in when they posted. The Find tab lists
   * only postings from the player's own area. Absent on older groups, which are listed everywhere. */
  area?: string;
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
  // 'player' (the only kind before store-driven events existed) or 'store' (materialized by the
  // sync-store-events Edge Function from a game store's calendar feed - see CLAUDE.md).
  source: 'player' | 'store';
  storeId?: string;
  storeName?: string;
  storeWebsite?: string;
  /** The store event (a local_events row) this group is playing at, if any. Links the group to
   * the Calendar tab's data and makes its rounds eligible for the store-event bonus. */
  localEventId?: string;
}

// HARDCODED_GROUPS (the static mock group list this file used to export on unitTests/
// test/<feature>) is gone as of the game-scoring feature: groups now have a real Supabase
// backend (see supabase/migrations/20260705140000_create_groups.sql and group-api.ts), so the
// mock data it stood in for no longer serves a purpose — its numeric ids aren't even compatible
// with the real UUID-based Group/PlayerProfile shape above. Anything wanting seed groups for
// manual testing should create real rows through the app (or group-api.ts directly) instead.
