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
 * The event area a player's location belongs to, as worked out by the server (the resolve-area
 * Edge Function). `id` is the slug stored in `local_events.area` and `label` is its display
 * name, e.g. "Reno-Sparks, NV". Areas are rows in the `event_areas` table, created on demand
 * the first time anyone sets their location to a city no existing area covers, so nothing about
 * a particular city is hardcoded in the app.
 */
export interface EventArea {
  id: string;
  label: string;
}

/**
 * What resolving a location returns: the area, whether that call refreshed its events from the
 * store locator, when they were last refreshed (ISO timestamp, or null if never), and the
 * reason if a refresh was attempted and failed (the area is still usable in that case).
 */
export interface EventAreaResolution {
  area: EventArea;
  synced: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
}
