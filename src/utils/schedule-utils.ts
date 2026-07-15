import { DayOfWeek, DAYS_OF_WEEK } from "../data/types";

/**
 * The picker state a create/edit schedule form works with: a day chosen from the same 15-day
 * rolling offset range browse.tsx's create form already uses (0 = today, 1 = tomorrow, ...),
 * plus an hour/minute/period stepper trio. This is the single shape both the create and edit
 * forms build against, replacing browse.tsx's inline offset/hour/minute/period state and
 * group-detail.tsx's separate day-of-week-chip + stepper state.
 */
export interface ScheduleParts {
  dateOffsetDays: number;
  hour: number;
  minute: number;
  period: "AM" | "PM";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_DATE_OFFSET_DAYS = 14;

const startOfLocalDay = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const to12Hour = (hour24: number): { hour: number; period: "AM" | "PM" } => {
  const period: "AM" | "PM" = hour24 < 12 ? "AM" : "PM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour, period };
};

const to24Hour = (hour12: number, period: "AM" | "PM"): number => {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
};

/**
 * Composes a scheduled_at epoch ms from picker state, the single source of truth for the date
 * math both the create-group form and the group-detail edit form need instead of each screen
 * building its own inline Date from independent offset/hour/minute/period state.
 * Parameters: parts (the picker's current day offset, hour, minute, and AM/PM period), now (an
 * injectable clock, defaulting to Date.now, so callers/tests can pin "today").
 * Returns: an epoch-ms timestamp for the composed date and time.
 * Edge cases: none beyond normal invalid input handling.
 */
export const buildScheduledAt = (
  parts: ScheduleParts,
  now: () => number = Date.now
): number => {
  const base = new Date(now());
  base.setDate(base.getDate() + parts.dateOffsetDays);
  base.setHours(to24Hour(parts.hour, parts.period), parts.minute, 0, 0);
  return base.getTime();
};

/**
 * Formats a scheduled_at epoch ms into the app's standard display string, e.g. "Today · 7:00 PM",
 * "Tomorrow · 7:00 PM", or "Wed, Jul 22 · 7:00 PM" for anything further out. This is the single
 * source of truth for rendering a group's time anywhere (group cards, group-detail, the weekly
 * calendar) instead of a screen typing/reconstructing the string by hand.
 * Parameters: scheduledAtMs (the epoch ms to format, or undefined for an unscheduled group), now
 * (an injectable clock, defaulting to Date.now, used to decide "Today"/"Tomorrow" relative to).
 * Returns: a display string, or an empty string when scheduledAtMs is undefined.
 * Edge cases: a scheduledAtMs in the past (relative to now) still formats normally rather than
 * throwing — callers are responsible for deciding whether a past time should be shown at all.
 */
export const formatScheduledAt = (
  scheduledAtMs: number | undefined,
  now: () => number = Date.now
): string => {
  if (scheduledAtMs === undefined) return "";

  const target = new Date(scheduledAtMs);
  const daysDiff = Math.round(
    (startOfLocalDay(scheduledAtMs) - startOfLocalDay(now())) / MS_PER_DAY
  );

  const dayLabel =
    daysDiff === 0
      ? "Today"
      : daysDiff === 1
        ? "Tomorrow"
        : target.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

  const { hour, period } = to12Hour(target.getHours());
  const minute = target.getMinutes() === 0 ? "00" : String(target.getMinutes()).padStart(2, "0");

  return `${dayLabel} · ${hour}:${minute} ${period}`;
};

/**
 * Decomposes an existing scheduled_at epoch ms back into ScheduleParts so an edit form can
 * pre-fill its date-offset chip and hour/minute/period steppers from real Date arithmetic,
 * replacing group-detail.tsx's old regex-based time-string parsing (which silently fell back to
 * a default 7:00 PM for any string not matching its exact expected shape).
 * Parameters: scheduledAtMs (the epoch ms to decompose, or undefined for a group with no schedule
 * yet), now (an injectable clock, defaulting to Date.now, used to compute the date offset).
 * Returns: ScheduleParts matching scheduledAtMs, or a default of "today, 7:00 PM" when
 * scheduledAtMs is undefined.
 * Edge cases: a date more than 14 days out or in the past clamps dateOffsetDays into the picker's
 * supported [0, 14] range rather than producing an out-of-range value; minutes not aligned to the
 * picker's 15-minute grid (possible for a store-synced event, though those aren't host-editable)
 * round to the nearest 15-minute slot.
 */
export const toScheduleParts = (
  scheduledAtMs: number | undefined,
  now: () => number = Date.now
): ScheduleParts => {
  if (scheduledAtMs === undefined) {
    return { dateOffsetDays: 0, hour: 7, minute: 0, period: "PM" };
  }

  const target = new Date(scheduledAtMs);
  const rawOffset = Math.round(
    (startOfLocalDay(scheduledAtMs) - startOfLocalDay(now())) / MS_PER_DAY
  );
  const dateOffsetDays = Math.min(Math.max(rawOffset, 0), MAX_DATE_OFFSET_DAYS);

  const { hour, period } = to12Hour(target.getHours());
  const minute = Math.round(target.getMinutes() / 15) * 15 % 60;

  return { dateOffsetDays, hour, minute, period };
};

/**
 * Returns the UTC calendar-day bucket key ("YYYY-MM-DD") for a scheduled_at epoch ms, matching
 * the group_players_one_per_day database constraint's own bucketing so client-side conflict
 * checks (see findGroupOnSameDay in group-utils.ts) agree with what the server will accept.
 * Parameters: scheduledAtMs (the epoch ms to bucket).
 * Returns: a "YYYY-MM-DD" string in UTC.
 * Edge cases: none beyond normal invalid input handling.
 */
export const scheduleDateKey = (scheduledAtMs: number): string =>
  new Date(scheduledAtMs).toISOString().slice(0, 10);

/**
 * Returns the real day-of-week label a scheduled_at instant falls on in the viewer's local time,
 * for grouping groups into the weekly calendar's Mon-Sun columns. Always computed from a real
 * Date rather than typed/parsed text, unlike the day chip group-detail.tsx used to reconstruct
 * via regex.
 * Parameters: scheduledAtMs (the epoch ms to inspect).
 * Returns: one of the DAYS_OF_WEEK values (Monday-first).
 * Edge cases: none beyond normal invalid input handling.
 */
export const scheduleDayOfWeek = (scheduledAtMs: number): DayOfWeek =>
  DAYS_OF_WEEK[(new Date(scheduledAtMs).getDay() + 6) % 7];
