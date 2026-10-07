import { describe, expect, it } from "@jest/globals";
import { LocalEvent } from "../data/local-events";
import {
  buildMonthGrid,
  dateKeyFromMs,
  eventsOnDate,
  formatAgo,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  listFormats,
  shiftMonth,
  shortVenueName,
  toDateKey,
  upcomingAgenda,
  venueLabelsByDay,
} from "./calendar-utils";

const makeEvent = (overrides: Partial<LocalEvent>): LocalEvent => ({
  id: "event-1",
  area: "reno-sparks",
  venueName: "Test Venue",
  address: "",
  gameType: "mtg",
  format: "Commander",
  startTime: "18:00:00",
  title: "",
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

  describe("shortVenueName", () => {
    it("shortens the real Reno-Sparks store names to fit a day cell", () => {
      expect(shortVenueName("Kobold's Keep")).toBe("Kobold's");
      expect(shortVenueName("The Glass Die")).toBe("Glass Die");
      expect(shortVenueName("Monsters & Mayhem Games")).toBe("Monsters");
      expect(shortVenueName("Comic Kingdom")).toBe("Comic");
      expect(shortVenueName("Coffee N' Comics - Moana")).toBe("Coffee");
      expect(shortVenueName("Game Kastle - Reno")).toBe("Game");
      expect(shortVenueName("GameStop - 2603 - Ridgeview Plaza")).toBe("GameStop");
      expect(shortVenueName("Ironwood Games")).toBe("Ironwood");
      expect(shortVenueName("The Coffer")).toBe("Coffer");
    });

    it("never returns more than 9 characters", () => {
      const cut = shortVenueName("Supercalifragilistic Games");
      expect(cut).toHaveLength(9);
      expect(cut.endsWith("…")).toBe(true);
    });

    it("returns an empty string for a blank name", () => {
      expect(shortVenueName("")).toBe("");
      expect(shortVenueName("   ")).toBe("");
    });
  });

  describe("venueLabelsByDay", () => {
    it("lists each day's venues in start order and omits days with none", () => {
      const events = [
        makeEvent({ id: "a", venueName: "The Coffer", dayOfWeek: 3, startTime: "18:00:00" }),
        makeEvent({ id: "b", venueName: "Kobold's Keep", dayOfWeek: 3, startTime: "15:00:00" }),
        makeEvent({ id: "c", venueName: "Comic Kingdom", eventDate: "2026-10-10" }),
      ];
      const labels = venueLabelsByDay(events, 2026, 9);
      expect([...labels.keys()]).toEqual([7, 10, 14, 21, 28]);
      expect(labels.get(7)).toEqual(["Kobold's", "Coffer"]);
      expect(labels.get(10)).toEqual(["Comic"]);
      expect(labels.has(8)).toBe(false);
    });

    it("writes a venue once even with two events that day or two branches of one chain", () => {
      const events = [
        makeEvent({ id: "a", venueName: "Coffee N' Comics - Moana", eventDate: "2026-10-09" }),
        makeEvent({ id: "b", venueName: "Coffee N' Comics - Sparks", eventDate: "2026-10-09" }),
        makeEvent({
          id: "c",
          venueName: "Coffee N' Comics - Moana",
          eventDate: "2026-10-09",
          startTime: "20:00:00",
        }),
      ];
      expect(venueLabelsByDay(events, 2026, 9).get(9)).toEqual(["Coffee"]);
    });

    it("returns an empty map when the month has no events", () => {
      expect(venueLabelsByDay([], 2026, 9).size).toBe(0);
      expect(venueLabelsByDay([makeEvent({ eventDate: "2026-11-10" })], 2026, 9).size).toBe(0);
    });
  });

  describe("upcomingAgenda", () => {
    const events = [
      makeEvent({ id: "wed-late", dayOfWeek: 3, startTime: "18:00:00" }),
      makeEvent({ id: "wed-early", dayOfWeek: 3, startTime: "15:00:00" }),
      makeEvent({ id: "one-off", eventDate: "2026-10-10" }),
      makeEvent({ id: "next-month", eventDate: "2026-11-03" }),
    ];

    it("lists the remaining days with events, in order, starting from the given day", () => {
      const agenda = upcomingAgenda(events, 2026, 9, 8);
      expect(agenda.map((d) => d.dateKey)).toEqual([
        "2026-10-10",
        "2026-10-14",
        "2026-10-21",
        "2026-10-28",
      ]);
      expect(agenda[1].day).toBe(14);
      expect(agenda[1].events.map((e) => e.id)).toEqual(["wed-early", "wed-late"]);
    });

    it("includes the starting day itself", () => {
      expect(upcomingAgenda(events, 2026, 9, 7)[0].dateKey).toBe("2026-10-07");
    });

    it("never runs past the end of the month", () => {
      const keys = upcomingAgenda(events, 2026, 9, 1).map((d) => d.dateKey);
      expect(keys.every((k) => k.startsWith("2026-10-"))).toBe(true);
    });

    it("returns an empty array when nothing is left, and tolerates out-of-range start days", () => {
      expect(upcomingAgenda(events, 2026, 9, 29)).toEqual([]);
      expect(upcomingAgenda(events, 2026, 9, 40)).toEqual([]);
      expect(upcomingAgenda([], 2026, 9, 1)).toEqual([]);
      expect(upcomingAgenda(events, 2026, 9, -5)[0].dateKey).toBe("2026-10-07");
    });
  });

  describe("listFormats", () => {
    it("puts Commander first and the rest in alphabetical order, without duplicates", () => {
      const events = [
        makeEvent({ format: "Standard" }),
        makeEvent({ format: "Booster Draft" }),
        makeEvent({ format: "Commander" }),
        makeEvent({ format: "Standard" }),
      ];
      expect(listFormats(events)).toEqual(["Commander", "Booster Draft", "Standard"]);
    });

    it("is just alphabetical when the preferred format is absent", () => {
      const events = [makeEvent({ format: "Standard" }), makeEvent({ format: "Modern" })];
      expect(listFormats(events)).toEqual(["Modern", "Standard"]);
    });

    it("ignores blank formats and returns an empty array for no events", () => {
      expect(listFormats([makeEvent({ format: "  " })])).toEqual([]);
      expect(listFormats([])).toEqual([]);
    });
  });

  describe("formatAgo", () => {
    const now = new Date("2026-10-07T12:00:00.000Z").getTime();
    const ago = (ms: number) => new Date(now - ms).toISOString();
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;

    it("describes recent moments in minutes, hours, and days", () => {
      expect(formatAgo(ago(20 * 1000), now)).toBe("just now");
      expect(formatAgo(ago(1 * MIN), now)).toBe("1 min ago");
      expect(formatAgo(ago(59 * MIN), now)).toBe("59 min ago");
      expect(formatAgo(ago(1 * HOUR), now)).toBe("1 hr ago");
      expect(formatAgo(ago(23 * HOUR), now)).toBe("23 hr ago");
      expect(formatAgo(ago(24 * HOUR), now)).toBe("1 day ago");
      expect(formatAgo(ago(72 * HOUR), now)).toBe("3 days ago");
    });

    it("says 'never' for a missing or unparseable timestamp", () => {
      expect(formatAgo(null, now)).toBe("never");
      expect(formatAgo(undefined, now)).toBe("never");
      expect(formatAgo("not a date", now)).toBe("never");
    });

    it("treats a timestamp slightly in the future as 'just now'", () => {
      expect(formatAgo(new Date(now + 5 * MIN).toISOString(), now)).toBe("just now");
    });

    it("accepts the +00:00 form the database returns", () => {
      expect(formatAgo("2026-10-07T11:30:00.000+00:00", now)).toBe("30 min ago");
    });
  });
});
