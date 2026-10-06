import { useQuery } from '@tanstack/react-query';
import { fetchLocalEvents } from '../lib/local-event-api';

/**
 * Query key factory for local event data, so every call site shares the same cache keys.
 * Parameters: none beyond the key builder's own arguments.
 * Returns: an object with a `list(area, format)` key builder.
 * Edge cases: none.
 */
export const localEventKeys = {
  list: (area: string, format?: string) => ['local-events', area, format ?? 'all'] as const,
};

/**
 * Fetches and caches the local play nights for one area (the Calendar tab's data source).
 * Results are cached per area and format, so switching areas later doesn't reuse another city's
 * list. Like every other query it is persisted, so the last-seen calendar renders on cold start.
 * Parameters: area (the area slug), format (an optional format name to narrow to).
 * Returns: the standard React Query result object; `data` is a LocalEvent[].
 * Edge cases: disabled while area is an empty string.
 */
export const useLocalEventsQuery = (area: string, format?: string) =>
  useQuery({
    queryKey: localEventKeys.list(area, format),
    queryFn: () => fetchLocalEvents(area, format),
    enabled: area.length > 0,
  });
