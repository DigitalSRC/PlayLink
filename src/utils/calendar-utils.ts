import { DEFAULT_EVENT_AREA_ID, EVENT_AREAS, EventArea, LocalEvent } from '../data/local-events';

export interface YearMonth {
  year: number;
  /** 0 = January ... 11 = December, same as Date.getMonth(). */
  month: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Builds the "YYYY-MM-DD" key the calendar uses to identify a day. It is assembled from plain
 * numbers rather than Date.toISOString(), which converts to UTC and can land on the wrong day
 * for anyone west of Greenwich in the evening. The same format is what `local_events.event_date`
 * arrives as, so a key can be compared to a one-off event's date directly.
 * Parameters: year (full year), month (0-11), day (1-31).
 * Returns: a zero-padded "YYYY-MM-DD" string.
 * Edge cases: does no range checking - an impossible date like day 31 of February is formatted
 * as given rather than rolled over or rejected.
 */
export const toDateKey = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month + 1)}-${pad2(day)}`;

/**
 * Returns the date key for the local calendar day an instant falls on. This is how the calendar
 * decides which cell is "today", using the viewer's own time zone. Callers pass getNow() from
 * AppContext rather than Date.now() so the dev date offset is respected.
 * Parameters: ms (epoch milliseconds).
 * Returns: a "YYYY-MM-DD" string in local time.
 * Edge cases: an invalid ms (NaN) yields a key containing "NaN", which matches no real day.
 */
export const dateKeyFromMs = (ms: number): string => {
  const d = new Date(ms);
  return toDateKey(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Lays a month out as rows of seven cells, Sunday first, for rendering a month grid. Each cell
 * is the day-of-month number, or null for the blank slots before the 1st and after the last day
 * that pad the first and last rows out to full weeks.
 * Parameters: year (full year), month (0-11).
 * Returns: an array of weeks (4 to 6 of them), each an array of exactly 7 cells.
 * Edge cases: an out-of-range month is normalized by Date (month 12 is January of the next
 * year); a February that starts on a Sunday in a non-leap year yields exactly 4 rows.
 */
export const buildMonthGrid = (year: number, month: number): (number | null)[][] => {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

/**
 * Moves a year/month pair forward or backward by a number of months, rolling the year over as
 * needed. Used by the calendar's previous/next buttons so the screen never has to do its own
 * December-to-January arithmetic.
 * Parameters: current (the starting year and month), delta (months to move; negative goes back).
 * Returns: the resulting YearMonth.
 * Edge cases: a delta of 0 returns an equal pair; large deltas roll over multiple years.
 */
export const shiftMonth = (current: YearMonth, delta: number): YearMonth => {
  const d = new Date(current.year, current.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
};

/**
 * Formats a year/month pair as a calendar heading, e.g. "October 2026". Kept here so the month
 * title is produced the same way wherever a month view appears.
 * Parameters: current (the year and month to label).
 * Returns: the month name followed by the full year.
 * Edge cases: none beyond normal invalid input handling.
 */
export const formatMonthTitle = (current: YearMonth): string =>
  new Date(current.year, current.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

/**
 * Formats a date key as a readable day heading, e.g. "Wednesday, October 7". The key is split
 * into numbers and built as a local date, because `new Date("YYYY-MM-DD")` parses as UTC and
 * would show the previous day in US time zones.
 * Parameters: dateKey (a "YYYY-MM-DD" string).
 * Returns: the weekday, month name, and day number.
 * Edge cases: a malformed key returns an empty string rather than "Invalid Date".
 */
export const formatDayHeading = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

/**
 * Formats a database wall-clock time ("18:30:00") for display as "6:30 PM". The value is treated
 * as plain text and never passed through Date, so it is shown exactly as the venue's local time
 * regardless of the viewer's time zone.
 * Parameters: time (an "HH:MM" or "HH:MM:SS" 24-hour string).
 * Returns: a 12-hour time with AM/PM.
 * Edge cases: returns an empty string for a value that isn't a valid 24-hour time, so a bad row
 * shows no time instead of "NaN:NaN".
 */
export const formatEventTime = (time: string): string => {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return '';
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return '';
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${period}`;
};

/**
 * Picks out the events that happen on one specific day. A weekly event matches every date that
 * falls on its day of the week; a one-off event matches only its own date. The result is ordered
 * by start time so the day's list reads top to bottom in the order things begin.
 * Parameters: events (every event for the area), year, month (0-11), day (1-31).
 * Returns: the matching events, earliest start first, ties broken by venue name.
 * Edge cases: returns an empty array when nothing matches or events is empty; an event with
 * neither dayOfWeek nor eventDate set (which the database forbids) matches no day.
 */
export const eventsOnDate = (
  events: LocalEvent[],
  year: number,
  month: number,
  day: number
): LocalEvent[] => {
  const weekday = new Date(year, month, day).getDay();
  const key = toDateKey(year, month, day);
  return events
    .filter((event) =>
      event.eventDate !== undefined ? event.eventDate === key : event.dayOfWeek === weekday
    )
    .sort(
      (a, b) => a.startTime.localeCompare(b.startTime) || a.venueName.localeCompare(b.venueName)
    );
};

/**
 * Counts how many events fall on each day of a month, for drawing the marker under each day in
 * the grid. Computed once per month so the grid doesn't re-filter the event list for every cell.
 * Parameters: events (every event for the area), year, month (0-11).
 * Returns: a Map from day-of-month to event count, containing only days that have events.
 * Edge cases: returns an empty Map when there are no events in the month.
 */
export const countEventsByDay = (
  events: LocalEvent[],
  year: number,
  month: number
): Map<number, number> => {
  const counts = new Map<number, number>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const count = eventsOnDate(events, year, month, day).length;
    if (count > 0) counts.set(day, count);
  }
  return counts;
};

/**
 * Decides which event area a player belongs to from the free-text location on their profile.
 * Each area lists place-name keywords; the first area with a keyword appearing as a whole word
 * in the location wins. This is what lets the calendar grow beyond one city without the screen
 * changing - a new area only needs an entry in EVENT_AREAS.
 * Parameters: location (the profile's location text, or undefined), areas (the list to search,
 * defaulting to EVENT_AREAS).
 * Returns: the matched EventArea, or the default area when nothing matches.
 * Edge cases: matching is case-insensitive and whole-word, so "Moreno Valley" does not match
 * "reno"; an empty or missing location, or one in a city with no area yet, falls back to the
 * default area; if the default id is somehow absent from the list, the first area is returned.
 */
export const resolveEventArea = (
  location: string | undefined,
  areas: EventArea[] = EVENT_AREAS
): EventArea => {
  const words = (location ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const matched = areas.find((area) => area.keywords.some((kw) => words.includes(kw)));
  return matched ?? areas.find((area) => area.id === DEFAULT_EVENT_AREA_ID) ?? areas[0];
};
