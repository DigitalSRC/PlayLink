// Scheduled job: fetches every active game_stores row's published event calendar (iCal/.ics or
// RSS) and materializes each upcoming occurrence as a `groups` row with source = 'store', so
// local game stores' real events show up as joinable listings alongside player-created groups.
// Triggered by a pg_cron schedule (see the 20260707180000_sync_store_events_cron.sql migration)
// rather than a user request, so this function is deployed with --no-verify-jwt and checks its
// own shared secret instead of a Supabase JWT - same pattern as refresh-rivals/index.ts.
//
// Deploy: npx supabase functions deploy sync-store-events --no-verify-jwt
// Secret: npx supabase secrets set STORE_SYNC_CRON_SECRET=<same value stored in the vault, see the migration>

import { createClient } from 'npm:@supabase/supabase-js@2';
import { icalAdapter } from './adapters/ical.ts';
import { rssAdapter } from './adapters/rss.ts';
import { FeedAdapter } from './adapters/types.ts';
import { GameStoreRow, mapFeedEventToGroupRow } from './mapping.ts';

// How far ahead to expand recurring events. Wide enough that a weekly game night's next several
// occurrences are always materialized before the previous one is cleaned up by the existing
// hourly stale-group cron, without expanding so far that most rows are for events months away.
const SYNC_WINDOW_DAYS = 28;

const ADAPTERS: Record<GameStoreRow['feed_type'], FeedAdapter> = {
  ical: icalAdapter,
  rss: rssAdapter,
};

/**
 * Fetches and syncs a single store's feed: downloads feed_url, parses it with the adapter
 * matching feed_type, maps each occurrence to a groups row, and upserts them keyed on
 * (store_id, external_uid) so re-running the sync updates existing occurrences rather than
 * duplicating them.
 * Parameters: supabase (service-role client), store (the game_stores row to sync), windowEndMs.
 * Returns: the number of occurrences upserted for this store.
 * Edge cases: throws if the feed can't be fetched or returns a non-2xx status, or if the upsert
 * fails - the caller wraps every store's sync in Promise.allSettled so one store's failure
 * doesn't block the others.
 */
const syncStore = async (
  // deno-lint-ignore no-explicit-any
  supabase: any,
  store: GameStoreRow,
  windowEndMs: number
): Promise<number> => {
  const response = await fetch(store.feed_url);
  if (!response.ok) {
    throw new Error(`${store.name}: feed fetch failed with status ${response.status}`);
  }
  const feedText = await response.text();

  const adapter = ADAPTERS[store.feed_type];
  const events = adapter.parse(feedText, windowEndMs);

  const rows = events
    .map((event) => mapFeedEventToGroupRow(event, store))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return 0;

  const { error } = await supabase.from('groups').upsert(rows, { onConflict: 'store_id,external_uid' });
  if (error) throw new Error(`${store.name}: ${error.message}`);

  return rows.length;
};

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('STORE_SYNC_CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: stores, error: fetchError } = await supabase
    .from('game_stores')
    .select('id, name, website_url, feed_url, feed_type, city, state, game_types, default_format, game_type_keywords, default_target_players, active')
    .eq('active', true);
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const windowEndMs = Date.now() + SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const results = await Promise.allSettled(
    (stores as GameStoreRow[]).map((store) => syncStore(supabase, store, windowEndMs))
  );

  const failures = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const synced = results
    .filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled')
    .reduce((sum, r) => sum + r.value, 0);

  return new Response(
    JSON.stringify({ storesSynced: results.length - failures.length, groupsUpserted: synced, failed: failures.map((f) => String(f.reason)) }),
    { status: failures.length > 0 ? 207 : 200, headers: { 'Content-Type': 'application/json' } }
  );
});
