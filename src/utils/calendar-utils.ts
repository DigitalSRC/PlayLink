import { LocalEvent } from '../data/local-events';

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

// Longest venue label that fits a day cell on a phone-width month grid at the cell's font size.
const MAX_VENUE_LABEL_LENGTH = 9;

/**
 * Shortens a venue name so it fits inside a single day cell of the month grid, where there is
 * room for roughly nine characters. It drops a leading "The" and any " - branch" suffix, and if
 * the name is still too long it keeps just the first word, which is how regulars refer to these
 * stores anyway ("Kobold's", "Monsters", "Ironwood").
 * Parameters: name (the full venue name, e.g. "Coffee N' Comics - Moana").
 * Returns: a label of at most 9 characters.
 * Edge cases: a single word longer than the limit is cut and ends in an ellipsis; an empty or
 * whitespace-only name returns an empty string; two branches of one chain shorten to the same
 * label, which is intended - the full names are shown in the list under the calendar.
 */
export const shortVenueName = (name: string): string => {
  const base = name.trim().replace(/^the\s+/i, '').split(' - ')[0].trim();
  if (base.length <= MAX_VENUE_LABEL_LENGTH) return base;
  const firstWord = base.split(/\s+/)[0];
  return firstWord.length <= MAX_VENUE_LABEL_LENGTH
    ? firstWord
    : `${firstWord.slice(0, MAX_VENUE_LABEL_LENGTH - 1)}…`;
};

/**
 * Works out which venue labels to write on each day of a month. Computed once for the whole
 * month so the grid doesn't re-filter the event list for every cell. Labels are the shortened
 * venue names, in the order the day's events start.
 * Parameters: events (the events to show, already narrowed to one format), year, month (0-11).
 * Returns: a Map from day-of-month to that day's labels, containing only days that have events.
 * Edge cases: returns an empty Map when the month has no events; a venue with two events on one
 * day, or two venues that shorten to the same label, appear once.
 */
export const venueLabelsByDay = (
  events: LocalEvent[],
  year: number,
  month: number
): Map<number, string[]> => {
  const labels = new Map<number, string[]>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dayLabels = [
      ...new Set(eventsOnDate(events, year, month, day).map((e) => shortVenueName(e.venueName))),
    ].filter((label) => label !== '');
    if (dayLabels.length > 0) labels.set(day, dayLabels);
  }
  return labels;
};

/** One day in the upcoming list: its date key, day-of-month, and that day's events in order. */
export interface AgendaDay {
  dateKey: string;
  day: number;
  events: LocalEvent[];
}

/**
 * Builds the "coming up" list shown under the calendar: every remaining day of the month that
 * has at least one event, starting from a given day, each with its events in start-time order.
 * Days with nothing on are left out so the list is only what a player could actually go to.
 * Parameters: events (the events to show, already narrowed to one format), year, month (0-11),
 * fromDay (the first day to include, normally today's day-of-month).
 * Returns: the days with events from fromDay to the end of the month, earliest first.
 * Edge cases: returns an empty array when nothing is left this month (e.g. on the last day
 * after the final event); a fromDay below 1 is treated as 1; a fromDay past the end of the
 * month returns an empty array. Events earlier today are still listed, since the list is by
 * day, not by hour.
 */
export const upcomingAgenda = (
  events: LocalEvent[],
  year: number,
  month: number,
  fromDay: number
): AgendaDay[] => {
  const agenda: AgendaDay[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = Math.max(1, fromDay); day <= daysInMonth; day++) {
    const dayEvents = eventsOnDate(events, year, month, day);
    if (dayEvents.length > 0) {
      agenda.push({ dateKey: toDateKey(year, month, day), day, events: dayEvents });
    }
  }
  return agenda;
};

/**
 * Lists the distinct formats present in a set of events, for the format switcher. The preferred
 * format is put first when present, so the app's main focus (Commander) is always the first
 * choice, and the rest follow alphabetically.
 * Parameters: events (every event for the area, all formats), preferred (the format to list
 * first, default "Commander").
 * Returns: the distinct format names.
 * Edge cases: returns an empty array for no events; events with a blank format are ignored;
 * formats differing only in letter case are treated as different, since the sync writes one
 * consistent spelling per format.
 */
export const listFormats = (events: LocalEvent[], preferred: string = 'Commander'): string[] => {
  const formats = [...new Set(events.map((e) => e.format).filter((f) => f.trim() !== ''))].sort(
    (a, b) => a.localeCompare(b)
  );
  return formats.includes(preferred)
    ? [preferred, ...formats.filter((f) => f !== preferred)]
    : formats;
};

/**
 * Describes how long ago something happened in a few words, e.g. "just now", "12 min ago",
 * "3 hr ago", or "2 days ago". Used for the "events updated ..." line on the Calendar tab, where
 * a rough age is more useful than a timestamp.
 * Parameters: iso (the ISO timestamp of the moment, or null/undefined if it never happened), nowMs
 * (the current time in epoch ms; callers pass getNow() so the dev date offset is respected).
 * Returns: a short relative phrase, or "never" when iso is missing.
 * Edge cases: an unparseable timestamp also returns "never"; a moment in the future (clock skew
 * between phone and server) is reported as "just now" rather than a negative age.
 */
export const formatAgo = (iso: string | null | undefined, nowMs: number): string => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const minutes = Math.floor((nowMs - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
