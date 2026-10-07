// Scheduled job: keeps the Calendar tab's `local_events` table filled with the Magic events
// (Commander and the other formats) that local game stores have posted to Wizards of the Coast's store/event locator. Runs every
// 6 hours via pg_cron (see the 20261006130000_sync_local_events_cron.sql migration), so the app
// itself never talks to the locator - phones only ever read our own table.
//
// Like refresh-rivals, this is triggered by cron rather than a user, so it is deployed with
// --no-verify-jwt and checks the shared x-cron-secret header instead of a Supabase JWT. It
// reuses the same CRON_SECRET / vault 'cron_secret' as refresh-rivals, so there is no new secret
// to set; rotating that one secret rotates it for both jobs.
//
// Deploy: npx supabase functions deploy sync-local-events --no-verify-jwt

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SYNC_AREAS, type SyncArea } from './areas.ts';
import { mapEventsToRows, toVenueLocal } from './mapping.ts';
import { fetchEvents, fetchStores } from './wizards.ts';

// How long a past feed event is kept before being pruned, so "last week" is still browsable.
const KEEP_PAST_DAYS = 30;

interface AreaResult {
  area: string;
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
 * Syncs one area: fetch from the locator, upsert the events, then remove feed rows the
 * locator no longer lists. The order is what keeps a failure safe - nothing is written or
 * removed until both fetches have fully succeeded, and removal only runs after the upsert has.
 * Hand-curated rows (source = 'curated') are never touched.
 * Parameters: supabase (a service-role client), area (the area to sync), now (the run's instant).
 * Returns: counts of rows upserted and removed, plus a note when the run deliberately did nothing.
 * Edge cases: throws if either fetch fails or is partial, or if a database call errors, leaving
 * existing rows as they were; if the locator returns no usable events at all, that is treated
 * as suspect and existing rows are left untouched rather than wiped; running twice in a row is
 * harmless, since rows are keyed by the locator's event id.
 */
const syncArea = async (supabase: SupabaseClient, area: SyncArea, now: Date): Promise<AreaResult> => {
  const [stores, events] = await Promise.all([fetchStores(area), fetchEvents(area)]);

  const syncedAt = now.toISOString();
  const rows = mapEventsToRows(events, stores, area, syncedAt);
  if (rows.length === 0) {
    return {
      area: area.id,
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
    upserted: rows.length,
    removed: (cancelled?.length ?? 0) + (expired?.length ?? 0),
  };
};

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Areas are independent: one city's locator hiccup must not block another city's update.
  const now = new Date();
  const results = await Promise.allSettled(SYNC_AREAS.map((area) => syncArea(supabase, area, now)));

  const synced = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = results.flatMap((r, i) =>
    r.status === 'rejected' ? [`${SYNC_AREAS[i].id}: ${String(r.reason)}`] : []
  );

  return new Response(JSON.stringify({ synced, failed }), {
    status: failed.length > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
