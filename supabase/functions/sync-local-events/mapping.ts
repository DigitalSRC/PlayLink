import type { SyncArea } from './areas.ts';
import type { WizardsEvent, WizardsStore } from './wizards.ts';

// Everything from the feed is text typed by a store employee into someone else's system. It is
// only ever rendered as plain text in the app, but lengths are still capped so one oversized
// field can't bloat the table or a calendar card.
const MAX_VENUE_LENGTH = 120;
const MAX_TITLE_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 200;
const MAX_NOTES_LENGTH = 500;
const MAX_FORMAT_LENGTH = 40;

// The locator also lists non-Magic events (D&D nights and the like) under this catch-all format.
// The calendar is for Magic formats, so those are left out.
const SKIPPED_FORMAT = 'OTHER';

/** Shape of a `local_events` row written by the sync (see the create_local_events migration). */
export interface LocalEventUpsertRow {
  area: string;
  venue_name: string;
  address: string;
  game_type: 'mtg';
  format: string;
  event_date: string;
  start_time: string;
  title: string;
  notes: string;
  source: 'feed';
  external_uid: string;
  active: true;
  updated_at: string;
}

/**
 * Collapses whitespace and trims a piece of feed text to a maximum length. Feed descriptions
 * often contain line breaks and repeated spaces, which read badly on a small card.
 * Parameters: value (the raw text, possibly null), maxLength (the cap in characters).
 * Returns: the cleaned text, ending in an ellipsis if it had to be cut.
 * Edge cases: null, undefined, or whitespace-only input returns an empty string.
 */
export const cleanText = (value: string | null | undefined, maxLength: number): string => {
  const collapsed = (value ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
};

/**
 * Converts one of the feed's UTC timestamps into the calendar date and clock time at the venue.
 * `local_events` stores wall-clock values with no time zone, so a 6:00 PM event must be written
 * as 18:00 on the venue's own date - which for an evening event in the US is the day *before*
 * its UTC date.
 * Parameters: iso (a UTC timestamp such as "2026-10-07T00:30:00.0000000Z"), timeZone (the
 * venue's IANA zone).
 * Returns: { date: "YYYY-MM-DD", time: "HH:MM:00" } in that zone, or null if iso isn't a valid
 * timestamp.
 * Edge cases: uses the tz database, so daylight-saving changes are handled without a fixed
 * offset; the feed's 7-digit fractional seconds are trimmed before parsing, since not every JS
 * engine accepts more than 3.
 */
export const toVenueLocal = (
  iso: string | null | undefined,
  timeZone: string
): { date: string; time: string } | null => {
  if (!iso) return null;
  const instant = new Date(iso.replace(/\.(\d{3})\d+/, '.$1'));
  if (Number.isNaN(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:00`,
  };
};

/**
 * Tidies a locator postal address for display by dropping the trailing country, which is noise
 * on a local calendar ("675 Holcomb Ave, Reno, NV, 89501, United States").
 * Parameters: postalAddress (the store's address from the locator, possibly null).
 * Returns: the address without its country suffix.
 * Edge cases: null or empty input returns an empty string; an address with no recognizable
 * country suffix is returned unchanged apart from whitespace cleanup.
 */
export const formatAddress = (postalAddress: string | null | undefined): string =>
  cleanText(postalAddress, MAX_ADDRESS_LENGTH).replace(/,\s*(United States|USA|US)$/i, '');

/**
 * Works out the display name of an event's format, e.g. "Commander" or "Booster Draft". The
 * locator supplies a readable name alongside its internal code; when that name is missing the
 * code itself is tidied up ("BOOSTER_DRAFT" becomes "Booster Draft") so every event of a format
 * still ends up under one consistent label for the app's format switcher.
 * Parameters: event (the locator event).
 * Returns: the format label, or null if the event has no usable format.
 * Edge cases: returns null for the catch-all OTHER format (non-Magic events) and for a missing
 * or blank format code; the label is whitespace-cleaned and length-capped like other feed text.
 */
export const formatLabel = (event: WizardsEvent): string | null => {
  const code = (event.format ?? '').trim();
  if (code === '' || code === SKIPPED_FORMAT) return null;
  const named = cleanText(event.eventFormat?.name, MAX_FORMAT_LENGTH);
  if (named !== '') return named;
  return cleanText(
    code
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' '),
    MAX_FORMAT_LENGTH
  );
};

/**
 * Turns the locator's events for one area into `local_events` rows. Every scheduled Magic event
 * is kept, whatever its format, so the app can switch between Commander and the others. Each row is a one-off dated event keyed by the locator's own event id, so
 * re-running the sync updates rows in place instead of duplicating them.
 * Parameters: events (everything fetchEvents returned), stores (everything fetchStores returned,
 * used to look up each venue's address), area (the area being synced), syncedAt (the run's ISO
 * timestamp, stamped on every row so rows the feed no longer lists can be found afterwards).
 * Returns: the rows to upsert, one per kept event.
 * Edge cases: skips events that are cancelled or otherwise not SCHEDULED, have no usable
 * format (including the non-Magic OTHER catch-all), have no venue, no id, or an unparseable start time; an event whose store isn't in the store
 * list still maps, with an empty address; duplicate event ids keep the first occurrence; an
 * empty title falls back to the format name.
 */
export const mapEventsToRows = (
  events: WizardsEvent[],
  stores: WizardsStore[],
  area: SyncArea,
  syncedAt: string
): LocalEventUpsertRow[] => {
  const addressByStoreId = new Map(
    stores.map((store) => [String(store.id), formatAddress(store.postalAddress)])
  );
  const seen = new Set<string>();
  const rows: LocalEventUpsertRow[] = [];

  for (const event of events) {
    if (event.status !== 'SCHEDULED') continue;
    const format = formatLabel(event);
    if (!format) continue;
    if (!event.id || !event.organization?.name) continue;
    const local = toVenueLocal(event.scheduledStartTime, area.timeZone);
    if (!local) continue;

    const externalUid = `wizards:${event.id}`;
    if (seen.has(externalUid)) continue;
    seen.add(externalUid);

    rows.push({
      area: area.id,
      venue_name: cleanText(event.organization.name, MAX_VENUE_LENGTH),
      address: addressByStoreId.get(String(event.organization.id)) ?? '',
      game_type: 'mtg',
      format,
      event_date: local.date,
      start_time: local.time,
      title: cleanText(event.title, MAX_TITLE_LENGTH) || format,
      notes: cleanText(event.description, MAX_NOTES_LENGTH),
      source: 'feed',
      external_uid: externalUid,
      active: true,
      updated_at: syncedAt,
    });
  }
  return rows;
};
