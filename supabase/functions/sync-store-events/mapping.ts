import { FeedEvent } from './adapters/types.ts';

export interface GameStoreRow {
  id: string;
  name: string;
  website_url: string;
  feed_url: string;
  feed_type: 'ical' | 'rss';
  city: string;
  state: string;
  game_types: string[];
  default_format: string;
  game_type_keywords: Record<string, string[]>;
  default_target_players: number;
  active: boolean;
}

export interface GroupUpsertRow {
  name: string;
  join_code: string;
  scheduled_at: string;
  target_players: number;
  brackets: number[];
  location: string;
  time: string;
  game_type: string;
  format: string;
  no_go: string[];
  source: 'store';
  store_id: string;
  external_uid: string;
}

// Same alphabet/length as src/utils/group-utils.ts's generateJoinCode, duplicated here since Edge
// Functions run on Deno and can't import React Native app source directly (same precedent as
// refresh-rivals/index.ts's rankRivals duplicating rival-utils.ts's findRivals).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateJoinCode = (): string =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

/**
 * Picks which of a store's supported game types a feed event belongs to. A single-game store
 * (the common case - most stores only track one card game) skips inference entirely. A
 * multi-game store's event is matched by keyword against game_type_keywords; an event matching
 * no keyword is skipped rather than guessed, since assigning it to the wrong game would surface
 * it as an incorrect listing.
 * Parameters: event (the parsed feed event), store (the game_stores row it came from).
 * Returns: a GameType string, or null if no game type can be determined.
 * Edge cases: returns null for a store with zero game_types configured (nothing to assign).
 */
export const inferGameType = (event: FeedEvent, store: GameStoreRow): string | null => {
  if (store.game_types.length === 0) return null;
  if (store.game_types.length === 1) return store.game_types[0];

  const haystack = `${event.title} ${event.description ?? ''}`.toLowerCase();
  for (const gameType of store.game_types) {
    const keywords = store.game_type_keywords[gameType] ?? [];
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) {
      return gameType;
    }
  }
  return null;
};

/**
 * Picks a format string for an event (e.g. "Commander") by keyword match against the store's
 * per-game-type keyword hints, falling back to the store's default_format when nothing matches -
 * unlike inferGameType, a format is never a hard requirement for a listing to be useful, so this
 * always returns something rather than skipping the event.
 * Parameters: event, store, gameType (the already-inferred game type for this event).
 * Returns: a format string (may be an empty string if the store has no default_format set).
 * Edge cases: none beyond normal invalid input handling.
 */
export const inferFormat = (event: FeedEvent, store: GameStoreRow, gameType: string): string => {
  const haystack = `${event.title} ${event.description ?? ''}`.toLowerCase();
  const keywords = store.game_type_keywords[gameType] ?? [];
  const matched = keywords.find((kw) => haystack.includes(kw.toLowerCase()));
  return matched ?? store.default_format;
};

const formatDisplayTime = (date: Date): string => {
  const hours = date.getHours();
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minute = date.getMinutes() === 0 ? '00' : String(date.getMinutes()).padStart(2, '0');
  const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dayLabel} · ${hour12}:${minute} ${period}`;
};

/**
 * Maps one parsed feed occurrence plus its store into a `groups` upsert row. This is the single
 * point where a FeedEvent stops being feed-specific data and becomes an ordinary group row,
 * indistinguishable (aside from source/store_id/external_uid) from a player-created group once
 * inserted - which is what lets it participate in the same browse/join/per-day-conflict machinery
 * with no special-casing elsewhere in the app.
 * Parameters: event (a normalized FeedEvent), store (the game_stores row it came from).
 * Returns: a GroupUpsertRow ready for `supabase.from('groups').upsert(...)`, or null if no game
 * type could be inferred for this event (see inferGameType).
 * Edge cases: none beyond normal invalid input handling.
 */
export const mapFeedEventToGroupRow = (event: FeedEvent, store: GameStoreRow): GroupUpsertRow | null => {
  const gameType = inferGameType(event, store);
  if (!gameType) return null;

  return {
    name: event.title,
    join_code: generateJoinCode(),
    scheduled_at: event.startAt.toISOString(),
    target_players: store.default_target_players,
    brackets: [],
    location: [store.name, store.city, store.state].filter(Boolean).join(', '),
    time: formatDisplayTime(event.startAt),
    game_type: gameType,
    format: inferFormat(event, store, gameType),
    no_go: [],
    source: 'store',
    store_id: store.id,
    external_uid: event.externalUid,
  };
};
