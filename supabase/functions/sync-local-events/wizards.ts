// Reads stores and scheduled events from the service behind Wizards of the Coast's public store
// and event locator (https://locator.wizards.com). Game stores enter their Magic events there
// themselves, which makes it the one place that already has every participating store's
// Commander nights in a consistent, structured form.
//
// This is NOT a documented or supported API. It can change or disappear without notice, so
// everything here is written to fail loudly (throw) rather than return partial data - the caller
// relies on that to avoid deleting good rows after a bad fetch.

import type { SyncArea } from './areas.ts';

const ENDPOINT = 'https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql';
const PAGE_SIZE = 200;
// Upper bound on pages per query, so a misbehaving response can never loop forever.
const MAX_PAGES = 10;
const REQUEST_TIMEOUT_MS = 20000;

export interface WizardsStore {
  id: string;
  name: string;
  postalAddress: string | null;
}

export interface WizardsEvent {
  id: string;
  title: string | null;
  description: string | null;
  format: string | null;
  scheduledStartTime: string | null;
  status: string | null;
  organization: { id: string; name: string } | null;
}

const STORES_QUERY = `query($i: StoreByLocationInput!) {
  storesByLocation(input: $i) {
    pageInfo { totalResults }
    stores { id name postalAddress }
  }
}`;

const EVENTS_QUERY = `query($q: EventSearchQuery!) {
  searchEvents(query: $q) {
    pageInfo { totalResults }
    events { id title description format scheduledStartTime status organization { id name } }
  }
}`;

/**
 * Sends one GraphQL request to the locator service and returns its `data` object. Any outcome
 * other than a clean, complete answer is turned into a thrown error so callers never have to
 * check for half-successful responses themselves.
 * Parameters: query (the GraphQL document), variables (its variables).
 * Returns: the response's `data` object.
 * Edge cases: throws on a network failure, a timeout (20 s), a non-2xx status, a body that isn't
 * JSON, a GraphQL `errors` array, or a missing `data` field.
 */
const graphql = async (
  query: string,
  variables: Record<string, unknown>
  // deno-lint-ignore no-explicit-any
): Promise<Record<string, any>> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://locator.wizards.com' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`locator responded ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`locator error: ${body.errors[0].message}`);
  if (!body.data) throw new Error('locator returned no data');
  return body.data;
};

/**
 * Fetches every page of a paged locator query and concatenates the items. The total the service
 * reports is checked against what was actually collected, so a short or truncated read is an
 * error instead of a silently smaller list.
 * Parameters: fetchPage (given a page number, returns that page's items and the reported total).
 * Returns: all items across all pages.
 * Edge cases: returns an empty array when the service reports zero results; throws if the page
 * cap is reached before all results are read, or if fewer items arrive than were reported.
 */
export const fetchAllPages = async <T>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number }>
): Promise<T[]> => {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items, total } = await fetchPage(page);
    all.push(...items);
    if (all.length >= total) return all;
    if (items.length === 0) throw new Error(`locator returned ${all.length} of ${total} results`);
  }
  throw new Error(`locator has more than ${MAX_PAGES * PAGE_SIZE} results; refusing a partial read`);
};

/**
 * Fetches every store the locator lists within an area. Events don't carry a street address, so
 * the store list is what supplies one for each venue.
 * Parameters: area (the center point and radius to search).
 * Returns: the stores in range.
 * Edge cases: returns an empty array for an area with no stores; throws on any failed or partial
 * read (see graphql and fetchAllPages).
 */
export const fetchStores = (area: SyncArea): Promise<WizardsStore[]> =>
  fetchAllPages(async (page) => {
    const data = await graphql(STORES_QUERY, {
      i: {
        latitude: area.latitude,
        longitude: area.longitude,
        maxMeters: area.radiusMeters,
        pageSize: PAGE_SIZE,
        page,
        isPremium: false,
      },
    });
    const result = data.storesByLocation;
    return { items: result?.stores ?? [], total: result?.pageInfo?.totalResults ?? 0 };
  });

/**
 * Fetches every upcoming event, of any format, that the locator lists within an area. Filtering
 * down to Commander happens afterwards in mapping.ts, since the search input's filter fields
 * aren't documented.
 * Parameters: area (the center point and radius to search).
 * Returns: the upcoming events in range.
 * Edge cases: returns an empty array for an area with no upcoming events; throws on any failed
 * or partial read (see graphql and fetchAllPages).
 */
export const fetchEvents = (area: SyncArea): Promise<WizardsEvent[]> =>
  fetchAllPages(async (page) => {
    const data = await graphql(EVENTS_QUERY, {
      q: {
        latitude: area.latitude,
        longitude: area.longitude,
        maxMeters: area.radiusMeters,
        pageSize: PAGE_SIZE,
        page,
      },
    });
    const result = data.searchEvents;
    return { items: result?.events ?? [], total: result?.pageInfo?.totalResults ?? 0 };
  });
