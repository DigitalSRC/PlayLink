/**
 * One region the sync pulls events for, as the sync code uses it. Built from an `event_areas`
 * row (see the 20261007120000_event_areas.sql migration) - areas live in the database, not in
 * code, so a new city needs no deploy. `timeZone` is the venues' IANA zone, used to turn the
 * feed's UTC instants into the wall-clock date and time stored in `local_events`.
 */
export interface SyncArea {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timeZone: string;
}

/** An `event_areas` row, as read through the service-role client. */
export interface EventAreaRow {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  time_zone: string;
  last_requested_at: string;
  last_synced_at: string | null;
}

export const EVENT_AREA_COLUMNS =
  'id, label, latitude, longitude, radius_meters, time_zone, last_requested_at, last_synced_at';

/**
 * Converts an `event_areas` row into the shape the sync code works with. Kept as one small
 * function so the database's column naming stays out of the fetch and mapping code.
 * Parameters: row (an event_areas row).
 * Returns: the equivalent SyncArea.
 * Edge cases: none - the table's own constraints guarantee the values are in range.
 */
export const areaFromRow = (row: EventAreaRow): SyncArea => ({
  id: row.id,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  timeZone: row.time_zone,
});
