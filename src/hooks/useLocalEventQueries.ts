import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EventAreaResolution } from '../data/local-events';
import { EventAreaError, resolveEventArea } from '../lib/event-area-api';
import { fetchLocalEvents } from '../lib/local-event-api';
import { calendarLocation } from '../utils/calendar-utils';

/**
 * Query key factory for local event data, so every call site shares the same cache keys.
 * Parameters: none beyond the key builders' own arguments.
 * Returns: an object with `list(area, format)` and `area(location)` key builders.
 * Edge cases: `area` lower-cases and trims the location, so "Reno, NV" and " reno, nv " share
 * one cache entry instead of triggering two server lookups.
 */
export const localEventKeys = {
  list: (area: string, format?: string) => ['local-events', area, format ?? 'all'] as const,
  area: (location: string) => ['event-area', location.trim().toLowerCase()] as const,
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

/**
 * Works out, and caches, which event area a location belongs to. The key is the location text,
 * so it re-runs by itself whenever the player's profile location changes - from any screen -
 * which is also what pulls in events for a city nobody has used before. The answer is kept for
 * an hour before being re-checked, and persisted, so the calendar knows its area on cold start
 * and offline.
 * Parameters: location (the profile's free-text location).
 * Returns: the standard React Query result object; `data` is an EventAreaResolution and `error`
 * is an EventAreaError.
 * Edge cases: disabled while location is blank; a place the server doesn't recognise is not
 * retried (retyping is the fix, not waiting), while other failures get one retry.
 */
export const useEventAreaQuery = (location: string) =>
  useQuery<EventAreaResolution, EventAreaError>({
    queryKey: localEventKeys.area(location),
    queryFn: () => resolveEventArea(location),
    enabled: location.trim().length > 0,
    staleTime: 60 * 60 * 1000,
    retry: (failureCount, error) => error.code === 'unavailable' && failureCount < 1,
  });

/**
 * Loads the Calendar tab's data ahead of time, in the background, so opening the tab shows the
 * month straight away instead of "Finding events near...". It runs the very same two queries
 * the Calendar runs - which area the player's location belongs to, then that area's events -
 * so the answers land in the shared cache under the keys the Calendar reads.
 * It is mounted in the tab layout, which exists for as long as the player is signed in, so the
 * load starts on whichever tab they land on and also follows a change of location made anywhere.
 * Parameters: savedLocation (the profile's location, or nothing while the profile loads).
 * Returns: nothing; it exists only for its effect on the cache.
 * Edge cases: does nothing with no usable location (blank, or the old "Nearby" placeholder);
 * a failed lookup is left for the Calendar to report and retry, and shows nothing here; if the
 * data is already cached and fresh, no request is made; it never claims the Calendar starter
 * reward, which still requires actually opening the tab.
 */
export const usePreloadCalendar = (savedLocation: string | null | undefined): void => {
  const location = calendarLocation(savedLocation);
  const areaQuery = useEventAreaQuery(location);
  useLocalEventsQuery(areaQuery.data?.area.id ?? '');
};

/**
 * Asks the server to refresh an area's events now (the "Update events" button), then reloads
 * that area's event list. The fresh answer also replaces the cached area resolution, so the
 * "updated ... ago" line moves without a second request.
 * Parameters: none - call sites pass `{ location }`.
 * Returns: a React Query mutation object; its result is the EventAreaResolution.
 * Edge cases: the server may decline to refresh if the area was refreshed moments ago
 * (`synced: false`); that still resolves successfully and the list is reloaded anyway.
 */
export const useRefreshEventAreaMutation = () => {
  const queryClient = useQueryClient();
  return useMutation<EventAreaResolution, EventAreaError, { location: string }>({
    mutationFn: ({ location }) => resolveEventArea(location, true),
    onSuccess: (resolution, { location }) => {
      queryClient.setQueryData(localEventKeys.area(location), resolution);
      queryClient.invalidateQueries({ queryKey: ['local-events', resolution.area.id] });
    },
  });
};
