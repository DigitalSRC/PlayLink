import { describe, expect, it } from "@jest/globals";
import {
  buildScheduledAt,
  formatScheduledAt,
  scheduleDateKey,
  scheduleDayOfWeek,
  toScheduleParts,
} from "./schedule-utils";

// A fixed "now" so date-offset math is deterministic regardless of when the suite runs.
const FIXED_NOW = new Date(2026, 6, 15, 9, 0, 0, 0).getTime(); // Wed Jul 15 2026, 9:00 AM local
const now = () => FIXED_NOW;

describe("schedule-utils", () => {
  describe("buildScheduledAt", () => {
    it("builds today's date at the given time when dateOffsetDays is 0", () => {
      const result = buildScheduledAt({ dateOffsetDays: 0, hour: 7, minute: 30, period: "PM" }, now);
      const d = new Date(result);
      expect(d.getDate()).toBe(15);
      expect(d.getHours()).toBe(19);
      expect(d.getMinutes()).toBe(30);
    });

    it("rolls forward by dateOffsetDays", () => {
      const result = buildScheduledAt({ dateOffsetDays: 3, hour: 7, minute: 0, period: "PM" }, now);
      expect(new Date(result).getDate()).toBe(18);
    });

    it("converts 12 AM to hour 0 and 12 PM to hour 12", () => {
      const midnight = buildScheduledAt({ dateOffsetDays: 0, hour: 12, minute: 0, period: "AM" }, now);
      expect(new Date(midnight).getHours()).toBe(0);

      const noon = buildScheduledAt({ dateOffsetDays: 0, hour: 12, minute: 0, period: "PM" }, now);
      expect(new Date(noon).getHours()).toBe(12);
    });
  });

  describe("formatScheduledAt", () => {
    it("returns an empty string for undefined", () => {
      expect(formatScheduledAt(undefined, now)).toBe("");
    });

    it("labels the same local day as Today", () => {
      const target = new Date(2026, 6, 15, 19, 0, 0, 0).getTime();
      expect(formatScheduledAt(target, now)).toBe("Today · 7:00 PM");
    });

    it("labels the next local day as Tomorrow", () => {
      const target = new Date(2026, 6, 16, 7, 15, 0, 0).getTime();
      expect(formatScheduledAt(target, now)).toBe("Tomorrow · 7:15 AM");
    });

    it("labels anything further out with a weekday/month/day string", () => {
      const target = new Date(2026, 6, 22, 19, 0, 0, 0).getTime();
      expect(formatScheduledAt(target, now)).toBe("Wed, Jul 22 · 7:00 PM");
    });

    it("pads single-digit minutes with a leading zero", () => {
      const target = new Date(2026, 6, 15, 7, 5, 0, 0).getTime();
      expect(formatScheduledAt(target, now)).toBe("Today · 7:05 AM");
    });
  });

  describe("toScheduleParts", () => {
    it("defaults to today at 7:00 PM when scheduledAtMs is undefined", () => {
      expect(toScheduleParts(undefined, now)).toEqual({ dateOffsetDays: 0, hour: 7, minute: 0, period: "PM" });
    });

    it("round-trips with buildScheduledAt for a value within the 15-day picker range", () => {
      const original = buildScheduledAt({ dateOffsetDays: 5, hour: 3, minute: 30, period: "PM" }, now);
      expect(toScheduleParts(original, now)).toEqual({ dateOffsetDays: 5, hour: 3, minute: 30, period: "PM" });
    });

    it("clamps a date more than 14 days out to the picker's max offset", () => {
      const farFuture = buildScheduledAt({ dateOffsetDays: 30, hour: 7, minute: 0, period: "PM" }, now);
      expect(toScheduleParts(farFuture, now).dateOffsetDays).toBe(14);
    });

    it("clamps a date in the past to offset 0", () => {
      const past = new Date(2026, 6, 10, 19, 0, 0, 0).getTime();
      expect(toScheduleParts(past, now).dateOffsetDays).toBe(0);
    });

    it("rounds an off-grid minute value to the nearest 15-minute slot", () => {
      const offGrid = new Date(2026, 6, 15, 19, 7, 0, 0).getTime();
      expect(toScheduleParts(offGrid, now).minute).toBe(0);
    });
  });

  describe("scheduleDateKey", () => {
    it("returns a YYYY-MM-DD key in UTC", () => {
      expect(scheduleDateKey(Date.parse("2026-07-15T23:30:00Z"))).toBe("2026-07-15");
    });

    it("matches for two times on the same UTC calendar day", () => {
      const a = Date.parse("2026-07-15T00:00:00Z");
      const b = Date.parse("2026-07-15T23:59:00Z");
      expect(scheduleDateKey(a)).toBe(scheduleDateKey(b));
    });

    it("differs across a UTC day boundary", () => {
      const a = Date.parse("2026-07-15T23:59:00Z");
      const b = Date.parse("2026-07-16T00:01:00Z");
      expect(scheduleDateKey(a)).not.toBe(scheduleDateKey(b));
    });
  });

  describe("scheduleDayOfWeek", () => {
    it("maps a known Wednesday to 'Wednesday'", () => {
      // July 15, 2026 is a Wednesday.
      expect(scheduleDayOfWeek(new Date(2026, 6, 15, 12, 0, 0, 0).getTime())).toBe("Wednesday");
    });

    it("maps a known Sunday to 'Sunday'", () => {
      expect(scheduleDayOfWeek(new Date(2026, 6, 19, 12, 0, 0, 0).getTime())).toBe("Sunday");
    });

    it("maps a known Monday to 'Monday'", () => {
      expect(scheduleDayOfWeek(new Date(2026, 6, 13, 12, 0, 0, 0).getTime())).toBe("Monday");
    });
  });
});
