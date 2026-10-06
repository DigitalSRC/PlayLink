import { describe, expect, it } from "@jest/globals";
import { EventArea, LocalEvent } from "../data/local-events";
import {
  buildMonthGrid,
  countEventsByDay,
  dateKeyFromMs,
  eventsOnDate,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  resolveEventArea,
  shiftMonth,
  toDateKey,
} from "./calendar-utils";

const makeEvent = (overrides: Partial<LocalEvent>): LocalEvent => ({
  id: "event-1",
  area: "reno-sparks",
  venueName: "Test Venue",
  address: "",
  gameType: "mtg",
  format: "Commander",
  startTime: "18:00:00",
  notes: "",
  ...overrides,
});

describe("calendar-utils", () => {
  describe("toDateKey", () => {
    it("zero-pads the month and day and converts the 0-based month to 1-based", () => {
      expect(toDateKey(2026, 9, 6)).toBe("2026-10-06");
      expect(toDateKey(2026, 0, 1)).toBe("2026-01-01");
      expect(toDateKey(2026, 11, 31)).toBe("2026-12-31");
    });
  });

  describe("dateKeyFromMs", () => {
    it("uses the local calendar day, not the UTC one", () => {
      // 11:30 PM local is already the next day in UTC for any zone west of Greenwich; the key
      // must still be the local date.
      const lateEvening = new Date(2026, 9, 6, 23, 30).getTime();
      expect(dateKeyFromMs(lateEvening)).toBe("2026-10-06");

      const justAfterMidnight = new Date(2026, 9, 7, 0, 5).getTime();
      expect(dateKeyFromMs(justAfterMidnight)).toBe("2026-10-07");
    });
  });

  describe("buildMonthGrid", () => {
    it("pads the first week so day 1 lands under its weekday (Sunday first)", () => {
      // October 2026 starts on a Thursday.
      const grid = buildMonthGrid(2026, 9);
      expect(grid[0]).toEqual([null, null, null, null, 1, 2, 3]);
    });

    it("always returns full 7-cell weeks containing every day of the month exactly once", () => {
      const grid = buildMonthGrid(2026, 9);
      expect(grid.every((week) => week.length === 7)).toBe(true);
      expect(grid.flat().filter((day) => day !== null)).toEqual(
        Array.from({ length: 31 }, (_, i) => i + 1)
      );
    });

    it("pads the last week with blanks", () => {
      // October 31, 2026 is a Saturday, so the last row is full; November 30 is a Monday.
      const november = buildMonthGrid(2026, 10);
      expect(november[november.length - 1]).toEqual([29, 30, null, null, null, null, null]);
    });

    it("returns exactly 4 rows for a 28-day February starting on Sunday", () => {
      const grid = buildMonthGrid(2026, 1);
      expect(grid).toHaveLength(4);
      expect(grid[0][0]).toBe(1);
      expect(grid[3][6]).toBe(28);
    });

    it("returns 6 rows for a 31-day month starting on Saturday", () => {
      // August 2026 starts on a Saturday.
      expect(buildMonthGrid(2026, 7)).toHaveLength(6);
    });

    it("includes February 29 in a leap year", () => {
      expect(buildMonthGrid(2028, 1).flat()).toContain(29);
      expect(buildMonthGrid(2026, 1).flat()).not.toContain(29);
    });
  });

  describe("shiftMonth", () => {
    it("moves forward and backward within a year", () => {
      expect(shiftMonth({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 });
      expect(shiftMonth({ year: 2026, month: 5 }, -1)).toEqual({ year: 2026, month: 4 });
    });

    it("rolls the year over in both directions", () => {
      expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
      expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    });

    it("returns an equal pair for a delta of 0 and handles multi-year deltas", () => {
      expect(shiftMonth({ year: 2026, month: 9 }, 0)).toEqual({ year: 2026, month: 9 });
      expect(shiftMonth({ year: 2026, month: 9 }, 27)).toEqual({ year: 2029, month: 0 });
    });
  });

  describe("formatMonthTitle / formatDayHeading", () => {
    it("formats a month heading", () => {
      expect(formatMonthTitle({ year: 2026, month: 9 })).toBe("October 2026");
    });

    it("formats a day heading from a date key without shifting the day", () => {
      expect(formatDayHeading("2026-10-07")).toBe("Wednesday, October 7");
      expect(formatDayHeading("2026-01-01")).toBe("Thursday, January 1");
    });

    it("returns an empty string for a malformed key", () => {
      expect(formatDayHeading("not-a-date")).toBe("");
      expect(formatDayHeading("")).toBe("");
    });
  });

  describe("formatEventTime", () => {
    it("converts 24-hour database times to 12-hour display times", () => {
      expect(formatEventTime("18:30:00")).toBe("6:30 PM");
      expect(formatEventTime("09:05:00")).toBe("9:05 AM");
      expect(formatEventTime("18:00")).toBe("6:00 PM");
    });

    it("handles midnight and noon", () => {
      expect(formatEventTime("00:00:00")).toBe("12:00 AM");
      expect(formatEventTime("12:00:00")).toBe("12:00 PM");
      expect(formatEventTime("23:59:00")).toBe("11:59 PM");
    });

    it("returns an empty string for anything that is not a valid 24-hour time", () => {
      expect(formatEventTime("junk")).toBe("");
      expect(formatEventTime("")).toBe("");
      expect(formatEventTime("24:00:00")).toBe("");
      expect(formatEventTime("10:75:00")).toBe("");
    });
  });

  describe("eventsOnDate", () => {
    const wednesdayLate = makeEvent({ id: "wed-late", dayOfWeek: 3, startTime: "18:00:00" });
    const wednesdayEarly = makeEvent({ id: "wed-early", dayOfWeek: 3, startTime: "17:00:00" });
    const oneOff = makeEvent({ id: "one-off", eventDate: "2026-10-10" });
    const events = [wednesdayLate, wednesdayEarly, oneOff];

    it("matches a weekly event on every date with its weekday, earliest start first", () => {
      // October 7 and 14, 2026 are Wednesdays.
      expect(eventsOnDate(events, 2026, 9, 7).map((e) => e.id)).toEqual(["wed-early", "wed-late"]);
      expect(eventsOnDate(events, 2026, 9, 14).map((e) => e.id)).toEqual(["wed-early", "wed-late"]);
    });

    it("matches a one-off event only on its own date", () => {
      expect(eventsOnDate(events, 2026, 9, 10).map((e) => e.id)).toEqual(["one-off"]);
      expect(eventsOnDate(events, 2026, 9, 17)).toEqual([]);
      expect(eventsOnDate(events, 2026, 10, 10)).toEqual([]);
    });

    it("breaks a start-time tie by venue name", () => {
      const zed = makeEvent({ id: "z", venueName: "Zed's", dayOfWeek: 5 });
      const alpha = makeEvent({ id: "a", venueName: "Alpha Games", dayOfWeek: 5 });
      expect(eventsOnDate([zed, alpha], 2026, 9, 9).map((e) => e.id)).toEqual(["a", "z"]);
    });

    it("treats Sunday as weekday 0", () => {
      const sunday = makeEvent({ id: "sun", dayOfWeek: 0 });
      // October 4, 2026 is a Sunday.
      expect(eventsOnDate([sunday], 2026, 9, 4)).toHaveLength(1);
      expect(eventsOnDate([sunday], 2026, 9, 5)).toHaveLength(0);
    });

    it("returns an empty array for no events, and never matches an event with no schedule", () => {
      expect(eventsOnDate([], 2026, 9, 7)).toEqual([]);
      expect(eventsOnDate([makeEvent({ id: "broken" })], 2026, 9, 7)).toEqual([]);
    });

    it("does not mutate the input array", () => {
      const input = [wednesdayLate, wednesdayEarly];
      eventsOnDate(input, 2026, 9, 7);
      expect(input.map((e) => e.id)).toEqual(["wed-late", "wed-early"]);
    });
  });

  describe("countEventsByDay", () => {
    it("counts events per day and omits days with none", () => {
      const events = [
        makeEvent({ id: "a", dayOfWeek: 3 }),
        makeEvent({ id: "b", dayOfWeek: 3 }),
        makeEvent({ id: "c", eventDate: "2026-10-10" }),
      ];
      const counts = countEventsByDay(events, 2026, 9);
      expect([...counts.keys()]).toEqual([7, 10, 14, 21, 28]);
      expect(counts.get(7)).toBe(2);
      expect(counts.get(10)).toBe(1);
      expect(counts.has(8)).toBe(false);
    });

    it("returns an empty map when the month has no events", () => {
      expect(countEventsByDay([], 2026, 9).size).toBe(0);
      const otherMonth = [makeEvent({ eventDate: "2026-11-10" })];
      expect(countEventsByDay(otherMonth, 2026, 9).size).toBe(0);
    });
  });

  describe("resolveEventArea", () => {
    const areas: EventArea[] = [
      { id: "seattle", label: "Seattle, WA", keywords: ["seattle", "tacoma"] },
      { id: "reno-sparks", label: "Reno-Sparks, NV", keywords: ["reno", "sparks"] },
    ];

    it("matches a keyword anywhere in the location, case-insensitively", () => {
      expect(resolveEventArea("Downtown Seattle", areas).id).toBe("seattle");
      expect(resolveEventArea("TACOMA, wa", areas).id).toBe("seattle");
      expect(resolveEventArea("Sparks, NV", areas).id).toBe("reno-sparks");
    });

    it("only matches whole words, so 'Moreno Valley' is not Reno", () => {
      const noDefault: EventArea[] = [
        { id: "seattle", label: "Seattle, WA", keywords: ["seattle"] },
        { id: "other", label: "Other", keywords: ["reno"] },
      ];
      // With no default area in the list, a non-match returns the first area - proving the
      // "reno" keyword did not match inside "Moreno".
      expect(resolveEventArea("Moreno Valley, CA", noDefault).id).toBe("seattle");
    });

    it("falls back to the default area for an empty, missing, or unknown location", () => {
      expect(resolveEventArea("", areas).id).toBe("reno-sparks");
      expect(resolveEventArea(undefined, areas).id).toBe("reno-sparks");
      expect(resolveEventArea("Portland, OR", areas).id).toBe("reno-sparks");
    });

    it("resolves against the real area list by default", () => {
      expect(resolveEventArea("Reno").id).toBe("reno-sparks");
      expect(resolveEventArea(undefined).id).toBe("reno-sparks");
    });
  });
});
