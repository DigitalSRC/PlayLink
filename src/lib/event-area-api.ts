import { supabase } from './supabase';
import { EventAreaResolution } from '../data/local-events';

/** Why a location could not be turned into an event area. */
export type EventAreaErrorCode =
  | 'location_not_found'
  | 'invalid_location'
  | 'not_authenticated'
  | 'unavailable';

/**
 * Thrown by resolveEventArea when the server can't produce an area. `code` lets a screen tell
 * "we don't recognise that place" (ask the player to retype it) apart from "something is down"
 * (offer a retry), which need different messages.
 */
export class EventAreaError extends Error {
  code: EventAreaErrorCode;

  constructor(code: EventAreaErrorCode, message: string) {
    super(message);
    this.name = 'EventAreaError';
    this.code = code;
  }
}

const KNOWN_CODES: EventAreaErrorCode[] = ['location_not_found', 'invalid_location', 'not_authenticated'];

/**
 * Asks the server which event area a free-text location belongs to, via the resolve-area Edge
 * Function. The server looks the place up, reuses the area that covers it or creates a new one,
 * and refreshes that area's events from the store locator if they are stale - so calling this
 * for a city nobody has used before is what makes its events appear. How often a refresh can
 * actually happen is limited on the server, not here.
 * Parameters: location (the text from the player's profile, e.g. "Reno, NV"), refresh (true when
 * the player explicitly asked for an update, which shortens the server's cooldown).
 * Returns: the area, whether this call refreshed its events, and when they were last refreshed.
 * Edge cases: throws EventAreaError with code 'location_not_found' when the place can't be
 * identified, 'invalid_location' for empty or oversized text, 'not_authenticated' when signed
 * out, and 'unavailable' for anything else (network down, server error, malformed reply); a
 * failed refresh of an area that does resolve is NOT an error - it comes back with `syncError`
 * set so existing events can still be shown.
 */
export const resolveEventArea = async (
  location: string,
  refresh: boolean = false
): Promise<EventAreaResolution> => {
  const { data, error } = await supabase.functions.invoke('resolve-area', {
    body: { location, refresh },
  });

  if (error) {
    // For a non-2xx reply the function's JSON body is on error.context (a Response).
    let code: string | undefined;
    try {
      const body = await (error as { context?: Response }).context?.json();
      code = body?.error;
    } catch {
      code = undefined;
    }
    const known = KNOWN_CODES.find((c) => c === code);
    throw new EventAreaError(known ?? 'unavailable', code ?? error.message ?? 'Request failed');
  }

  const area = (data as Partial<EventAreaResolution> | null)?.area;
  if (!area || typeof area.id !== 'string' || typeof area.label !== 'string') {
    throw new EventAreaError('unavailable', 'Malformed response');
  }
  return {
    area: { id: area.id, label: area.label },
    synced: data.synced === true,
    lastSyncedAt: typeof data.lastSyncedAt === 'string' ? data.lastSyncedAt : null,
    syncError: typeof data.syncError === 'string' ? data.syncError : null,
  };
};
