// The sync of one area, shared by the scheduled job (index.ts) and the on-demand one a player
// triggers by changing location or tapping "Update events" (../resolve-area/index.ts).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { areaFromRow, type EventAreaRow, type SyncArea } from './areas.ts';
import { mapEventsToRows, toVenueLocal } from './mapping.ts';
import { fetchEvents, fetchStores } from './wizards.ts';

// How long a past feed event is kept before being pruned, so "last week" is still browsable.
const KEEP_PAST_DAYS = 30;

export interface AreaSyncResult {
  area: string;
  /** 'synced' ran a sync; 'skipped' means another sync of this area started too recently. */
  status: 'synced' | 'skipped';
  upserted: number;
  removed: number;
  note?: string;
}

/**
 * Subtracts whole days from a "YYYY-MM-DD" date string. Done in UTC on a date-only value, so
 * there is no time-of-day or daylight-saving component that could shift the result.
 * Parameters: date (a "YYYY-MM-DD" string), days (how many days to go back).
 * Returns: the earlier date as "YYYY-MM-DD".
 * Edge cases: crosses month and year boundaries correctly.
 */
const daysBefore = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * Syncs one area: fetch from the locator, upsert the events, then remove feed rows the locator
 * no longer lists. The order is what keeps a failure safe - nothing is written or removed until
 * both fetches have fully succeeded, and removal only runs after the upsert has. Hand-curated
 * rows (source = 'curated') are never touched.
 * Parameters: supabase (a service-role client), area (the area to sync), now (the run's instant).
 * Returns: counts of rows upserted and removed, plus a note when the run deliberately did nothing.
 * Edge cases: throws if either fetch fails or is partial, or if a database call errors, leaving
 * existing rows as they were; if the locator returns no usable events at all, existing rows are
 * left untouched rather than wiped (for a brand-new area that simply means it stays empty);
 * running twice in a row is harmless, since rows are keyed by the locator's event id.
 */
const syncArea = async (
  supabase: SupabaseClient,
  area: SyncArea,
  now: Date
): Promise<AreaSyncResult> => {
  const [stores, events] = await Promise.all([fetchStores(area), fetchEvents(area)]);

  const syncedAt = now.toISOString();
  const rows = mapEventsToRows(events, stores, area, syncedAt);
  if (rows.length === 0) {
    return {
      area: area.id,
      status: 'synced',
      upserted: 0,
      removed: 0,
      note: 'locator returned no events; left existing rows untouched',
    };
  }

  const { error: upsertError } = await supabase
    .from('local_events')
    .upsert(rows, { onConflict: 'area,external_uid' });
  if (upsertError) throw new Error(`upsert failed: ${upsertError.message}`);

  const today = toVenueLocal(syncedAt, area.timeZone)!.date;

  // Upcoming feed rows this run did not just write are events the store cancelled or removed.
  const { data: cancelled, error: cancelError } = await supabase
    .from('local_events')
    .delete()
    .eq('area', area.id)
    .eq('source', 'feed')
    .gte('event_date', today)
    .lt('updated_at', syncedAt)
    .select('id');
  if (cancelError) throw new Error(`removing cancelled events failed: ${cancelError.message}`);

  const { data: expired, error: expireError } = await supabase
    .from('local_events')
    .delete()
    .eq('area', area.id)
    .eq('source', 'feed')
    .lt('event_date', daysBefore(today, KEEP_PAST_DAYS))
    .select('id');
  if (expireError) throw new Error(`pruning old events failed: ${expireError.message}`);

  return {
    area: area.id,
    status: 'synced',
    upserted: rows.length,
    removed: (cancelled?.length ?? 0) + (expired?.length ?? 0),
  };
};

/**
 * Syncs an area only if no other sync of it started within the last minIntervalMs, and makes
 * sure two syncs of one area never overlap. It "claims" the area first by moving its
 * last_synced_at forward in a single guarded UPDATE; only the caller whose update lands gets to
 * sync. Without that, a manual refresh racing the scheduled job could each delete the rows the
 * other had just written. This is also the rate limit on how often anyone can make the server
 * call the locator for a given area.
 * Parameters: supabase (a service-role client), row (the area's current event_areas row), now
 * (the run's instant), minIntervalMs (the minimum gap between sync starts for this area).
 * Returns: the sync's result, or a 'skipped' result if the area was synced too recently or
 * another caller claimed it first.
 * Edge cases: if the sync throws, last_synced_at is put back to what it was so the next caller
 * can retry straight away instead of waiting out the interval, and the error is re-thrown; if
 * that restore itself fails, the only cost is waiting out the interval.
 */
export const claimAndSyncArea = async (
  supabase: SupabaseClient,
  row: EventAreaRow,
  now: Date,
  minIntervalMs: number
): Promise<AreaSyncResult> => {
  const cutoff = new Date(now.getTime() - minIntervalMs).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('event_areas')
    .update({ last_synced_at: now.toISOString() })
    .eq('id', row.id)
    // The timestamp is quoted because it contains ':' and '.', which are separators in this
    // filter syntax.
    .or(`last_synced_at.is.null,last_synced_at.lt."${cutoff}"`)
    .select('id');
  if (claimError) throw new Error(`claiming area failed: ${claimError.message}`);
  if (!claimed || claimed.length === 0) {
    return { area: row.id, status: 'skipped', upserted: 0, removed: 0, note: 'synced recently' };
  }

  try {
    return await syncArea(supabase, areaFromRow(row), now);
  } catch (error) {
    await supabase
      .from('event_areas')
      .update({ last_synced_at: row.last_synced_at })
      .eq('id', row.id)
      .eq('last_synced_at', now.toISOString());
    throw error;
  }
};
