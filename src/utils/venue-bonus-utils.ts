import { LocalEvent } from '../data/local-events';
import { GAME_LABELS, GameType } from '../data/types';
import { PlacementResult } from './scoring-utils';

/** Points each player earns, once per store event, for playing a round at that event. */
export const VENUE_EVENT_BONUS = 10;

// A round still counts for an event until this hour (venue time) the following morning, so a
// Commander night that runs past midnight isn't cut off at 12:00 AM.
const LATE_NIGHT_GRACE_HOUR = 4;

// How far ahead a store event can be and still have a group made for it. The Calendar tab only
// shows the current month, so anything further out is a malformed link, not a real choice.
const MAX_LINK_DAYS_AHEAD = 31;

/** A scored placement that also records how much of its points came from the store-event bonus. */
export interface BonusPlacementResult extends PlacementResult {
  venueBonus: number;
}

/** The parts of a local event that decide when its bonus can be earned. */
export interface VenueEventTiming {
  /** "YYYY-MM-DD" for a one-off event; undefined for a weekly one. */
  eventDate?: string;
  /** 0 = Sunday ... 6 = Saturday for a weekly event; undefined for a one-off. */
  dayOfWeek?: number;
  /** Venue wall-clock start, "HH:MM" or "HH:MM:SS". */
  startTime: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Works out the calendar date, clock time, and weekday at a venue for a given instant. A store's
 * event times are stored as wall-clock values in the store's own time zone, so "has the event
 * started?" has to be asked in that zone, not the phone's - which matters when a player is
 * travelling or the host's phone is set to another zone.
 * Parameters: nowMs (the instant, epoch ms), timeZone (the venue's IANA zone).
 * Returns: { date: "YYYY-MM-DD", time: "HH:MM", weekday: 0-6 } at the venue, or null if the time
 * zone isn't recognised.
 * Edge cases: uses the tz database, so daylight saving is handled; an invalid zone or instant
 * returns null rather than throwing, and callers treat null as "not eligible".
 */
export const venueLocalNow = (
  nowMs: number,
  timeZone: string
): { date: string; time: string; weekday: number } | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(nowMs));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const time = `${get('hour')}:${get('minute')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    const [y, m, d] = date.split('-').map(Number);
    return { date, time, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  } catch {
    return null;
  }
};

/**
 * Returns the calendar day before a "YYYY-MM-DD" date, with its weekday. Done in UTC on a
 * date-only value, so no time-of-day or daylight-saving shift can move the result.
 * Parameters: date (a "YYYY-MM-DD" string).
 * Returns: the previous day's date string and weekday (0 = Sunday).
 * Edge cases: crosses month and year boundaries correctly.
 */
const previousDay = (date: string): { date: string; weekday: number } => {
  const [y, m, d] = date.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return {
    date: `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`,
    weekday: prev.getUTCDay(),
  };
};

/**
 * Decides whether a round reported right now counts as being played at a store event. It counts
 * from the event's start time on the event's own day until 4:00 AM the next morning, all in the
 * venue's time zone. Before the start, on any other day, or after that cut-off, it does not.
 * Parameters: nowMs (when the round is being reported), event (the event's date or weekday and
 * its start time), timeZone (the venue's IANA zone).
 * Returns: true if the round falls inside the event's window.
 * Edge cases: returns false (never throws) for an unrecognised time zone, a malformed start
 * time, or an event with neither a date nor a weekday; a weekly event qualifies on every
 * matching weekday; a round reported at exactly the start time counts; one reported at exactly
 * 4:00 AM the next day does not.
 */
export const isWithinVenueEventWindow = (
  nowMs: number,
  event: VenueEventTiming,
  timeZone: string
): boolean => {
  const local = venueLocalNow(nowMs, timeZone);
  const startMatch = /^(\d{2}):(\d{2})/.exec(event.startTime);
  if (!local || !startMatch) return false;
  const start = `${startMatch[1]}:${startMatch[2]}`;

  const isEventDay = (date: string, weekday: number): boolean =>
    event.eventDate !== undefined
      ? event.eventDate === date
      : event.dayOfWeek !== undefined && event.dayOfWeek === weekday;

  if (isEventDay(local.date, local.weekday) && local.time >= start) return true;

  // The small hours after an event that started the evening before.
  const yesterday = previousDay(local.date);
  return (
    isEventDay(yesterday.date, yesterday.weekday) && local.time < `${pad2(LATE_NIGHT_GRACE_HOUR)}:00`
  );
};

/**
 * Collects the players who have already received the store-event bonus in a group's earlier
 * rounds, so it is only ever paid once per player per event however many rounds are reported.
 * Parameters: priorRounds (the placements of each round already reported for the group; rounds
 * the host cancelled are simply absent, since cancelling deletes them).
 * Returns: a Set of player ids that already have the bonus.
 * Edge cases: rounds recorded before this feature existed have no venueBonus field and count as
 * zero; an empty list returns an empty Set.
 */
export const playersAlreadyAwarded = (
  priorRounds: { playerId: string; venueBonus?: number }[][]
): Set<string> => {
  const awarded = new Set<string>();
  for (const round of priorRounds) {
    for (const placement of round) {
      if ((placement.venueBonus ?? 0) > 0) awarded.add(placement.playerId);
    }
  }
  return awarded;
};

/**
 * Adds the store-event bonus to a round's scored placements. Every player in the round who
 * hasn't had the bonus yet gets VENUE_EVENT_BONUS added to their points, and each placement
 * records how much bonus it includes (0 or the bonus) so later rounds can tell it was paid.
 * Standings and win/loss/draw are untouched - the bonus is for showing up, not for placing.
 * Parameters: scored (the output of computePlacementScores), eligible (whether this round falls
 * inside the store event's window), alreadyAwarded (players who received it in an earlier round).
 * Returns: the placements with a venueBonus field and pointsAwarded including it.
 * Edge cases: when eligible is false, or every player already has it, points are unchanged and
 * every venueBonus is 0; an empty round returns an empty array.
 */
export const applyVenueBonus = (
  scored: PlacementResult[],
  eligible: boolean,
  alreadyAwarded: Set<string>
): BonusPlacementResult[] =>
  scored.map((placement) => {
    const venueBonus = eligible && !alreadyAwarded.has(placement.playerId) ? VENUE_EVENT_BONUS : 0;
    return { ...placement, pointsAwarded: placement.pointsAwarded + venueBonus, venueBonus };
  });

/** A store event a new group is being made for, with where it lands on the create form. */
export interface StoreEventLink {
  eventId: string;
  venueName: string;
  gameType: GameType;
  format: string;
  /** The night the group is for, "YYYY-MM-DD". */
  dateKey: string;
  /** 0 = today, 1 = tomorrow, ... counted from the phone's own date. */
  dateOffset: number;
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
}

/**
 * Builds the route params the Calendar tab hands to the create-group form when a player taps
 * "Create game" on a store event. Everything the form needs is carried in the link itself, so
 * the form never has to look the event up again and can't open half-filled.
 * Parameters: event (the store event), dateKey (the "YYYY-MM-DD" night it was listed under,
 * which is what pins a weekly event to one particular night).
 * Returns: a flat object of strings, including openCreate: '1' to open the form.
 * Edge cases: does no validation of its own - parseStoreEventLink on the receiving side decides
 * whether the link is usable.
 */
export const storeEventLinkParams = (
  event: LocalEvent,
  dateKey: string
): Record<string, string> => ({
  openCreate: '1',
  storeEventId: event.id,
  storeEventVenue: event.venueName,
  storeEventDate: dateKey,
  storeEventStart: event.startTime,
  storeEventGame: event.gameType,
  storeEventFormat: event.format,
});

/**
 * Reads the route params written by storeEventLinkParams back into a store-event link, checking
 * every piece. This is the only way a new group gets tied to a store event, so anything missing
 * or malformed yields no link at all rather than a group quietly created without its bonus.
 * Parameters: params (the create screen's route params), todayKey (today as "YYYY-MM-DD" on
 * the phone).
 * Returns: the link with its date offset and 12-hour start time, or null if it can't be used.
 * Edge cases: returns null when any field is missing, empty, or not a string (a repeated param
 * arrives as an array), the game isn't one PlayLink knows, the date isn't a real calendar day,
 * is before today, or is more than 31 days out, or the start time isn't a valid 24-hour time;
 * an event earlier today is still allowed, since its bonus window is open.
 */
export const parseStoreEventLink = (
  params: Record<string, unknown>,
  todayKey: string
): StoreEventLink | null => {
  const text = (key: string): string => {
    const value = params[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const eventId = text('storeEventId');
  const venueName = text('storeEventVenue');
  const format = text('storeEventFormat');
  const gameType = text('storeEventGame');
  const dateKey = text('storeEventDate');
  if (eventId === '' || venueName === '' || format === '') return null;
  if (!Object.prototype.hasOwnProperty.call(GAME_LABELS, gameType)) return null;

  const dayMs = (key: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    // Rejects dates that only parse by rolling over, like February 31st.
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
      return null;
    }
    return date.getTime();
  };
  const eventMs = dayMs(dateKey);
  const todayMs = dayMs(todayKey);
  if (eventMs === null || todayMs === null) return null;
  const dateOffset = Math.round((eventMs - todayMs) / 86400000);
  if (dateOffset < 0 || dateOffset > MAX_LINK_DAYS_AHEAD) return null;

  const time = /^(\d{1,2}):(\d{2})/.exec(text('storeEventStart'));
  if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) return null;
  const hour24 = Number(time[1]);

  return {
    eventId,
    venueName,
    gameType: gameType as GameType,
    format,
    dateKey,
    dateOffset,
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: Number(time[2]),
    period: hour24 < 12 ? 'AM' : 'PM',
  };
};
