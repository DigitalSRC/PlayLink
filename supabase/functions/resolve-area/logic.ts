// Pure helpers for turning a player's free-text location into an event area. No network or
// database access here, so all of it is unit-testable (see src/__tests__/functions on the
// unitTests branch).

/** One place returned by the geocoder, reduced to the fields this function uses. */
export interface GeocodedPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country_code?: string;
  country?: string;
  admin1?: string;
  population?: number;
}

/** The minimum an existing area needs to expose for the distance check. */
export interface AreaCircle {
  id: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const STATE_ABBREVIATIONS = new Map(
  Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr])
);

export const MIN_LOCATION_LENGTH = 2;
export const MAX_LOCATION_LENGTH = 100;
// How many shortened versions of the city text to try ("Downtown Seattle" -> "Seattle").
const MAX_QUERY_VARIANTS = 3;

/**
 * Breaks a player's free-text location into what to ask the geocoder. People type things like
 * "Reno, NV", "Sparks", or "Downtown Seattle": the part before the first comma is the place
 * name, and anything after it is a region hint (a state or country) used to pick between
 * same-named places. Because the name may start with a neighbourhood word, shorter versions
 * with leading words dropped are offered as fallbacks.
 * Parameters: location (the raw text from the profile).
 * Returns: `queries` (place names to try, most specific first) and `regionHint` (the state or
 * country to prefer, with a US state abbreviation expanded to its full name), or null if the
 * text is unusable.
 * Edge cases: returns null for text that is empty, shorter than 2 or longer than 100 characters
 * once trimmed, or has nothing before the comma; a hint that isn't a US abbreviation is kept
 * as typed.
 */
export const parseLocation = (
  location: string
): { queries: string[]; regionHint: string | null } | null => {
  const trimmed = (location ?? '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < MIN_LOCATION_LENGTH || trimmed.length > MAX_LOCATION_LENGTH) return null;

  const [namePart, ...rest] = trimmed.split(',').map((part) => part.trim());
  if (namePart.length < MIN_LOCATION_LENGTH) return null;

  const rawHint = rest.find((part) => part !== '') ?? null;
  const regionHint = rawHint ? US_STATES[rawHint.toUpperCase()] ?? rawHint : null;

  const words = namePart.split(' ');
  const queries: string[] = [];
  for (let start = 0; start < words.length && queries.length < MAX_QUERY_VARIANTS; start++) {
    const query = words.slice(start).join(' ');
    if (query.length >= MIN_LOCATION_LENGTH && !queries.includes(query)) queries.push(query);
  }
  return { queries, regionHint };
};

/**
 * Chooses which geocoder result a player most likely meant. With a region hint, only places in
 * that state or country qualify - "Reno, NV" must never resolve to a Reno somewhere else just
 * because Nevada's wasn't in the list. Among the qualifying places the most populous wins, since
 * a bare "Sparks" far more often means the city of 96,000 than the town of 2,000.
 * Parameters: places (the geocoder's results for one query), regionHint (a state or country
 * name, or null).
 * Returns: the chosen place, or null if none qualifies.
 * Edge cases: returns null for an empty list or when a hint is given and nothing matches it; the
 * hint is compared case-insensitively against the state name, country name, and country code;
 * places missing coordinates or a time zone are ignored; ties in population keep the geocoder's
 * own ordering.
 */
export const pickPlace = (places: GeocodedPlace[], regionHint: string | null): GeocodedPlace | null => {
  const hint = regionHint?.trim().toLowerCase() ?? null;
  const usable = places.filter(
    (p) =>
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      typeof p.timezone === 'string' &&
      p.timezone !== '' &&
      typeof p.name === 'string' &&
      p.name.trim() !== ''
  );
  const candidates = hint
    ? usable.filter((p) =>
        [p.admin1, p.country, p.country_code].some((v) => (v ?? '').toLowerCase() === hint)
      )
    : usable;
  return candidates.reduce<GeocodedPlace | null>(
    (best, p) => (best === null || (p.population ?? 0) > (best.population ?? 0) ? p : best),
    null
  );
};

/**
 * Great-circle distance between two points on the Earth, in meters (the haversine formula).
 * Used to decide whether a location falls inside an existing area's search radius.
 * Parameters: lat1, lon1, lat2, lon2 (degrees).
 * Returns: the distance in meters.
 * Edge cases: identical points return 0; accurate to well under 1% at city scale, which is far
 * finer than a 25 km radius needs.
 */
export const haversineMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Finds the existing area a point belongs to, if any. A point belongs to an area when it lies
 * within that area's search radius, which is what makes Sparks resolve to the Reno-Sparks area
 * instead of creating a near-duplicate next door. When circles overlap, the nearest center wins.
 * Parameters: areas (every existing area), latitude, longitude (the point, in degrees).
 * Returns: the containing area with the nearest center, or null if the point is outside all.
 * Edge cases: returns null for an empty list; a point exactly on a radius counts as inside.
 */
export const findContainingArea = <T extends AreaCircle>(
  areas: T[],
  latitude: number,
  longitude: number
): T | null => {
  let best: { area: T; distance: number } | null = null;
  for (const area of areas) {
    const distance = haversineMeters(latitude, longitude, area.latitude, area.longitude);
    if (distance <= area.radius_meters && (best === null || distance < best.distance)) {
      best = { area, distance };
    }
  }
  return best?.area ?? null;
};

/**
 * Builds the id for a new area from a geocoded place, e.g. "sacramento-california-us". The id is
 * written to `local_events.area` and must match that column's slug rule: lowercase letters and
 * digits in groups joined by single hyphens. Accents are stripped rather than dropped so
 * "Montréal" becomes "montreal".
 * Parameters: place (the geocoded place the area is centered on).
 * Returns: a slug that satisfies the database's check constraint.
 * Edge cases: a name with no usable characters at all (e.g. written entirely in a non-Latin
 * script) falls back to "area-<geocoder id>", which is still unique and valid.
 */
export const areaSlug = (place: GeocodedPlace): string => {
  const slug = [place.name, place.admin1, place.country_code]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug !== '' ? slug.slice(0, 80).replace(/-+$/, '') : `area-${place.id}`;
};

/**
 * Builds the name shown for a new area at the top of the Calendar tab, e.g. "Sacramento, CA" or
 * "Toronto, Canada". US places use the familiar two-letter state; everywhere else uses the
 * country, since a foreign region name means little to most players.
 * Parameters: place (the geocoded place the area is centered on).
 * Returns: a short "City, Region" label.
 * Edge cases: falls back to the full state name if it has no known abbreviation, and to the
 * bare city name when neither a state nor a country is known.
 */
export const areaLabel = (place: GeocodedPlace): string => {
  const name = place.name.trim();
  if (place.country_code === 'US' && place.admin1) {
    return `${name}, ${STATE_ABBREVIATIONS.get(place.admin1.toLowerCase()) ?? place.admin1}`;
  }
  const region = place.country ?? place.admin1;
  return region ? `${name}, ${region}` : name;
};
