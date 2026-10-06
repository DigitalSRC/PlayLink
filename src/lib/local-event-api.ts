import { supabase } from './supabase';
import { LocalEvent } from '../data/local-events';
import { GameType } from '../data/types';

interface LocalEventRow {
  id: string;
  area: string;
  venue_name: string;
  address: string;
  game_type: string;
  format: string;
  day_of_week: number | null;
  event_date: string | null;
  start_time: string;
  end_time: string | null;
  title: string;
  notes: string;
}

const LOCAL_EVENT_SELECT =
  'id, area, venue_name, address, game_type, format, day_of_week, event_date, start_time, end_time, title, notes';

const mapLocalEventRow = (row: LocalEventRow): LocalEvent => ({
  id: row.id,
  area: row.area,
  venueName: row.venue_name,
  address: row.address,
  gameType: row.game_type as GameType,
  format: row.format,
  dayOfWeek: row.day_of_week ?? undefined,
  eventDate: row.event_date ?? undefined,
  startTime: row.start_time,
  endTime: row.end_time ?? undefined,
  title: row.title,
  notes: row.notes,
});

/**
 * Fetches the local play nights for one area, optionally narrowed to a single format. This is
 * the Calendar tab's only data source. Inactive rows never come back: the table's RLS policy
 * hides them from signed-in clients, so no `active` filter is needed (or trusted) here.
 * Parameters: area (the area slug, e.g. 'reno-sparks'), format (an optional format name such as
 * 'Commander', matched case-insensitively; omit to get every format).
 * Returns: an array of LocalEvent for that area.
 * Edge cases: returns an empty array when the area has no events yet; throws on any
 * Postgres/network error, including the table not existing because its migration hasn't been
 * applied.
 */
export const fetchLocalEvents = async (area: string, format?: string): Promise<LocalEvent[]> => {
  let query = supabase.from('local_events').select(LOCAL_EVENT_SELECT).eq('area', area);
  if (format) query = query.ilike('format', format);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as LocalEventRow[]).map(mapLocalEventRow);
};
