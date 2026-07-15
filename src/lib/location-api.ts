import US_CITIES from '../data/us-cities.json';

/**
 * A single city/state match returned by searchLocations, ready to display in an autosuggest
 * dropdown or write directly into a free-text location field. `city` and `state` stay split so
 * a future caller can filter/group by state without re-parsing `displayName`, while
 * `displayName` is the ready-to-render "City, ST" string every current call site just wants.
 */
export interface LocationSuggestion {
  city: string;
  state: string;
  displayName: string;
}

interface CityRecord {
  city: string;
  state: string;
  population: number;
}

const CITY_RECORDS = US_CITIES as CityRecord[];

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

/**
 * Searches the bundled static US city/state dataset for prefix matches against a user's
 * in-progress query, ranked by population so the most-likely city surfaces first. This is the
 * MVP implementation of the searchLocations provider contract below — it does no network I/O,
 * so it's instant and works offline.
 * Parameters: query (the raw, possibly-mixed-case, possibly-untrimmed text the user has typed).
 * Returns: up to MAX_RESULTS LocationSuggestion, most-populous match first.
 * Edge cases: returns [] for a trimmed query shorter than MIN_QUERY_LENGTH characters; matches
 * are case-insensitive prefix matches against either the city name alone or "city, state".
 */
const searchLocationsStatic = (query: string): LocationSuggestion[] => {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return [];
  }

  return CITY_RECORDS.filter((record) => {
    const cityLower = record.city.toLowerCase();
    const fullLower = `${cityLower}, ${record.state.toLowerCase()}`;
    return cityLower.startsWith(trimmed) || fullLower.startsWith(trimmed);
  })
    .sort((a, b) => b.population - a.population)
    .slice(0, MAX_RESULTS)
    .map((record) => ({
      city: record.city,
      state: record.state,
      displayName: `${record.city}, ${record.state}`,
    }));
};

/**
 * Searches for US city/state matches for a type-ahead location field. This is the single call
 * site every screen's location autosuggest goes through, so swapping the underlying data source
 * later (e.g. a Google Places-backed implementation once external geocoding is wired up) never
 * requires touching a call site — only this function's body would change.
 * Parameters: query (the user's in-progress typed text).
 * Returns: a promise resolving to up to 8 LocationSuggestion, best (most-populous) matches first.
 * Edge cases: resolves to [] for queries under 2 characters or with no matches; never rejects,
 * since the current implementation does no network I/O.
 */
export const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  return searchLocationsStatic(query);
};
