/**
 * One region the sync pulls events for. `id` is the slug written to `local_events.area` and must
 * match an entry in the app's EVENT_AREAS (src/data/local-events.ts) - duplicated here rather
 * than imported because Edge Functions run on Deno and can't import React Native app source
 * (same precedent as refresh-rivals's rankRivals). `timeZone` is the venues' IANA zone, used to
 * turn the feed's UTC instants into the wall-clock date and time stored in `local_events`.
 */
export interface SyncArea {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timeZone: string;
}

// Adding a city: add an entry here AND the matching entry in src/data/local-events.ts, then
// redeploy this function. Nothing else changes.
export const SYNC_AREAS: SyncArea[] = [
  // Centered between downtown Reno and Sparks. 25 km covers both cities without reaching
  // Carson City (~40 km south), which would be its own area.
  { id: 'reno-sparks', latitude: 39.5296, longitude: -119.8138, radiusMeters: 25000, timeZone: 'America/Los_Angeles' },
];
