import { GameType } from './types';

/**
 * One local play night shown on the Calendar tab, e.g. a game store's weekly Commander night.
 * Mirrors a `local_events` row (see supabase/migrations/20261006120000_create_local_events.sql).
 * Exactly one of dayOfWeek / eventDate is set: dayOfWeek for a night that repeats every week
 * (0 = Sunday ... 6 = Saturday, same as Date.getDay()), eventDate ("YYYY-MM-DD") for a one-off.
 * startTime / endTime are wall-clock "HH:MM:SS" strings at the venue, with no time zone.
 */
export interface LocalEvent {
  id: string;
  area: string;
  venueName: string;
  address: string;
  gameType: GameType;
  format: string;
  dayOfWeek?: number;
  eventDate?: string;
  startTime: string;
  endTime?: string;
  /** The event's own name, e.g. "Commander Free Play Wednesday"; empty when it has none. */
  title: string;
  notes: string;
}

/**
 * A region the calendar can show events for. `id` is the slug stored in `local_events.area`;
 * `keywords` are lowercase place names matched against a player's free-text profile location to
 * decide which area they belong to (see resolveEventArea in src/utils/calendar-utils.ts).
 */
export interface EventArea {
  id: string;
  label: string;
  keywords: string[];
}

// Every area the calendar knows about. PlayLink is starting in Reno-Sparks only; expanding to a
// new city means adding one entry here and inserting that city's rows into `local_events` with a
// matching `area` slug - no screen or query changes.
export const EVENT_AREAS: EventArea[] = [
  { id: 'reno-sparks', label: 'Reno-Sparks, NV', keywords: ['reno', 'sparks'] },
];

// Shown to anyone whose profile location doesn't match a known area.
export const DEFAULT_EVENT_AREA_ID = 'reno-sparks';
