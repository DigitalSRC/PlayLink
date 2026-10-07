import { LocalEvent } from '../data/local-events';
import { GameType } from '../data/types';
import { PlacementResult } from './scoring-utils';

/** Points each player earns, once per store event, for playing a round at that event. */
export const VENUE_EVENT_BONUS = 10;

// A round still counts for an event until this hour (venue time) the following morning, so a
// Commander night that runs past midnight isn't cut off at 12:00 AM.
const LATE_NIGHT_GRACE_HOUR = 4;

// How far ahead the create-group form's date picker reaches (today plus 14 days).
const PICKER_DAYS = 15;

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

/** A store event offered in the create-group form, with where it lands on the form's pickers. */
export interface StoreEventOption {
  event: LocalEvent;
  /** 0 = today, 1 = tomorrow, ... matching the create form's date chips. */
  dateOffset: number;
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
}

/**
 * Lists the store events a player can attach a new group to: dated events for the chosen game
 * and format that fall within the create form's 15-day date range, soonest first. Each comes
 * with the date-chip offset and 12-hour time to pre-fill the form with.
 * Parameters: events (every event for the player's area), gameType and format (what the group
 * will play), todayKey (today as "YYYY-MM-DD" on the phone), limit (most options to return).
 * Returns: up to `limit` options, ordered by date then start time then venue.
 * Edge cases: weekly events with no specific date are left out, since a group must be tied to
 * one particular night; events earlier than today or beyond the date range are left out; format
 * is compared case-insensitively; an unparseable start time is skipped; returns an empty array
 * when nothing matches.
 */
export const storeEventOptions = (
  events: LocalEvent[],
  gameType: GameType,
  format: string,
  todayKey: string,
  limit: number = 12
): StoreEventOption[] => {
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const wanted = format.trim().toLowerCase();
  const options: StoreEventOption[] = [];

  for (const event of events) {
    if (event.eventDate === undefined || event.gameType !== gameType) continue;
    if (event.format.trim().toLowerCase() !== wanted) continue;
    const [y, m, d] = event.eventDate.split('-').map(Number);
    const dateOffset = Math.round((Date.UTC(y, m - 1, d) - todayUtc) / 86400000);
    if (!Number.isFinite(dateOffset) || dateOffset < 0 || dateOffset >= PICKER_DAYS) continue;
    const time = /^(\d{1,2}):(\d{2})/.exec(event.startTime);
    if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) continue;
    const hour24 = Number(time[1]);
    options.push({
      event,
      dateOffset,
      hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
      minute: Number(time[2]),
      period: hour24 < 12 ? 'AM' : 'PM',
    });
  }

  return options
    .sort(
      (a, b) =>
        a.dateOffset - b.dateOffset ||
        a.event.startTime.localeCompare(b.event.startTime) ||
        a.event.venueName.localeCompare(b.event.venueName)
    )
    .slice(0, limit);
};
