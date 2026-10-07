// Called by the app (not cron) whenever a signed-in player's location changes, or when they tap
// "Update events" on the Calendar tab. Given the free-text location from their profile, it:
//   1. looks the place up with a geocoder to get coordinates and a time zone,
//   2. finds the event area that covers that point, or creates one centered on it,
//   3. syncs that area's events from the Wizards locator if it hasn't been synced recently,
//   4. returns the area so the app can read its events.
// This is what makes the calendar follow a player to another city without a code change.
//
// Deployed WITH JWT verification (the default), and it additionally requires a real signed-in
// user: the public anon key is itself a valid JWT, so gateway verification alone would let a
// signed-out caller in.
//
// What a caller can cause is deliberately small: one geocoder lookup, at most one new area row,
// and at most one locator sync per area per cooldown (enforced in the database by
// claimAndSyncArea, so it holds across all callers). The total number of areas is capped.
//
// Geocoding uses Open-Meteo's geocoding API (no key). It is free for non-commercial use; a
// commercial launch needs their paid plan or a different geocoder - only geocode() would change.
//
// Deploy: npx supabase functions deploy resolve-area

import { createClient } from 'npm:@supabase/supabase-js@2';
import { EVENT_AREA_COLUMNS, type EventAreaRow } from '../sync-local-events/areas.ts';
import { claimAndSyncArea } from '../sync-local-events/sync.ts';
import {
  areaLabel,
  areaSlug,
  findContainingArea,
  type GeocodedPlace,
  parseLocation,
  pickPlace,
} from './logic.ts';

const GEOCODER = 'https://geocoding-api.open-meteo.com/v1/search';
const GEOCODER_TIMEOUT_MS = 10000;
// Normal cooldown between syncs of one area when a player merely opens or changes location.
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;
// Shorter cooldown when the player explicitly taps "Update events".
const MANUAL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Hard ceiling on how many areas can ever exist, so typing city after city can't grow the table
// (and the scheduled sync's workload) without bound.
const MAX_AREAS = 500;
const NEW_AREA_RADIUS_METERS = 25000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Looks a place name up with the geocoder. Kept as the single function that knows which
 * geocoding service is in use, so swapping providers touches nothing else.
 * Parameters: query (a place name such as "Reno").
 * Returns: the matching places, possibly empty.
 * Edge cases: throws on a network failure, a timeout (10 s), or a non-2xx response; a response
 * with no `results` field (the service's way of saying "nothing found") returns an empty array.
 */
const geocode = async (query: string): Promise<GeocodedPlace[]> => {
  const url = `${GEOCODER}?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`geocoder responded ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.results) ? body.results : [];
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Require a real user, not just any valid JWT (see the header comment).
  const authorization = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: 'not_authenticated' });

  let payload: { location?: unknown; refresh?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  const parsed = typeof payload.location === 'string' ? parseLocation(payload.location) : null;
  if (!parsed) return json(400, { error: 'invalid_location' });
  const manual = payload.refresh === true;

  let place: GeocodedPlace | null = null;
  try {
    for (const query of parsed.queries) {
      place = pickPlace(await geocode(query), parsed.regionHint);
      if (place) break;
    }
  } catch (error) {
    return json(502, { error: 'geocoder_unavailable', detail: String(error) });
  }
  if (!place) return json(404, { error: 'location_not_found' });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: existing, error: areasError } = await supabase
    .from('event_areas')
    .select(EVENT_AREA_COLUMNS);
  if (areasError) return json(500, { error: 'areas_unavailable', detail: areasError.message });
  const areas = (existing ?? []) as EventAreaRow[];

  let area = findContainingArea(areas, place.latitude, place.longitude);
  if (!area) {
    if (areas.length >= MAX_AREAS) return json(429, { error: 'too_many_areas' });
    const id = areaSlug(place);
    // ignoreDuplicates: if two players ask for the same new city at the same moment, the second
    // insert is a no-op and both read back the one row.
    const { error: insertError } = await supabase.from('event_areas').upsert(
      {
        id,
        label: areaLabel(place),
        latitude: place.latitude,
        longitude: place.longitude,
        radius_meters: NEW_AREA_RADIUS_METERS,
        time_zone: place.timezone,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
    if (insertError) return json(500, { error: 'area_create_failed', detail: insertError.message });
    const { data: created, error: readError } = await supabase
      .from('event_areas')
      .select(EVENT_AREA_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (readError || !created) {
      return json(500, { error: 'area_create_failed', detail: readError?.message ?? 'not found' });
    }
    area = created as EventAreaRow;
  }

  const now = new Date();
  // Best-effort: marks the area as in use so the scheduled sync keeps refreshing it. A failure
  // here only risks the area going un-refreshed later, so it doesn't fail the request.
  await supabase.from('event_areas').update({ last_requested_at: now.toISOString() }).eq('id', area.id);

  // A sync failure must not hide the area: the app can still show whatever events it already
  // has for it, plus a note that the refresh didn't go through.
  let synced = false;
  let syncError: string | null = null;
  let lastSyncedAt = area.last_synced_at;
  try {
    const result = await claimAndSyncArea(
      supabase,
      area,
      now,
      manual ? MANUAL_SYNC_INTERVAL_MS : AUTO_SYNC_INTERVAL_MS
    );
    if (result.status === 'synced') {
      synced = true;
      lastSyncedAt = now.toISOString();
    }
  } catch (error) {
    syncError = String(error);
  }

  return json(200, {
    area: { id: area.id, label: area.label },
    synced,
    lastSyncedAt,
    syncError,
  });
});
