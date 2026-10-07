// Scheduled job: keeps the Calendar tab's `local_events` table filled with the Magic events
// (Commander and the other formats) that local game stores have posted to Wizards of the Coast's
// store/event locator. Runs every 6 hours via pg_cron (see the
// 20261006130000_sync_local_events_cron.sql migration), so the app itself never talks to the
// locator - phones only ever read our own table.
//
// Which areas to sync comes from the `event_areas` table. Only areas a player has asked for in
// the last 30 days are refreshed, most recently requested first, up to a fixed number per run.
//
// Like refresh-rivals, this is triggered by cron rather than a user, so it is deployed with
// --no-verify-jwt and checks the shared x-cron-secret header instead of a Supabase JWT. It
// reuses the same CRON_SECRET / vault 'cron_secret' as refresh-rivals, so there is no new secret
// to set; rotating that one secret rotates it for both jobs.
//
// Deploy: npx supabase functions deploy sync-local-events --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';
import { EVENT_AREA_COLUMNS, type EventAreaRow } from './areas.ts';
import { type AreaSyncResult, claimAndSyncArea } from './sync.ts';

// An area nobody has opened in this long stops being refreshed (its rows stay until pruned).
const ACTIVE_AREA_DAYS = 30;
// Ceiling on areas per run, so the job's runtime and its load on the locator stay bounded no
// matter how many cities have been requested.
const MAX_AREAS_PER_RUN = 50;
// Skip an area a player refreshed within the last hour - it's already current.
const MIN_INTERVAL_MS = 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const now = new Date();
  const activeSince = new Date(now.getTime() - ACTIVE_AREA_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: areas, error: areasError } = await supabase
    .from('event_areas')
    .select(EVENT_AREA_COLUMNS)
    .gte('last_requested_at', activeSince)
    .order('last_requested_at', { ascending: false })
    .limit(MAX_AREAS_PER_RUN);
  if (areasError) {
    return new Response(JSON.stringify({ error: areasError.message }), { status: 500 });
  }

  // One area at a time, deliberately: this is a courtesy to a service we don't own, and areas
  // are independent, so one city's failure is recorded and the loop moves on.
  const synced: AreaSyncResult[] = [];
  const failed: string[] = [];
  for (const row of (areas ?? []) as EventAreaRow[]) {
    try {
      synced.push(await claimAndSyncArea(supabase, row, now, MIN_INTERVAL_MS));
    } catch (error) {
      failed.push(`${row.id}: ${String(error)}`);
    }
  }

  return new Response(JSON.stringify({ synced, failed }), {
    status: failed.length > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
