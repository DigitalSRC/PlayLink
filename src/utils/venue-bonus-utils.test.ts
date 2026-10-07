import { describe, expect, it } from "@jest/globals";
import { LocalEvent } from "../data/local-events";
import { computePlacementScores } from "./scoring-utils";
import {
  applyVenueBonus,
  isWithinVenueEventWindow,
  playersAlreadyAwarded,
  storeEventOptions,
  VENUE_EVENT_BONUS,
  venueLocalNow,
} from "./venue-bonus-utils";

const LA = "America/Los_Angeles";
// October 2026 is daylight time in Los Angeles (UTC-7); December is standard time (UTC-8).
const laOct = (day: number, hour: number, minute = 0) =>
  Date.UTC(2026, 9, day, hour + 7, minute);

describe("venue-bonus-utils", () => {
  describe("venueLocalNow", () => {
    it("reports the venue's date, time, and weekday rather than UTC's", () => {
      // 6:30 PM on Wednesday Oct 7 in LA is already Thursday in UTC.
      expect(venueLocalNow(laOct(7, 18, 30), LA)).toEqual({
        date: "2026-10-07",
        time: "18:30",
        weekday: 3,
      });
    });

    it("follows daylight saving", () => {
      expect(venueLocalNow(Date.UTC(2026, 11, 10, 2, 0), LA)).toEqual({
        date: "2026-12-09",
        time: "18:00",
        weekday: 3,
      });
    });

    it("writes midnight as 00:00", () => {
      expect(venueLocalNow(laOct(8, 0, 0), LA)?.time).toBe("00:00");
    });

    it("returns null for an unknown time zone", () => {
      expect(venueLocalNow(laOct(7, 18), "Not/AZone")).toBeNull();
    });
  });

  describe("isWithinVenueEventWindow", () => {
    const event = { eventDate: "2026-10-07", startTime: "18:00:00" };

    it("is false before the event starts", () => {
      expect(isWithinVenueEventWindow(laOct(7, 17, 59), event, LA)).toBe(false);
      expect(isWithinVenueEventWindow(laOct(7, 9, 0), event, LA)).toBe(false);
    });

    it("is true from the start time through the rest of the evening", () => {
      expect(isWithinVenueEventWindow(laOct(7, 18, 0), event, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(7, 21, 30), event, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(7, 23, 59), event, LA)).toBe(true);
    });

    it("stays true after midnight until 4:00 AM, then stops", () => {
      expect(isWithinVenueEventWindow(laOct(8, 0, 30), event, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(8, 3, 59), event, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(8, 4, 0), event, LA)).toBe(false);
      expect(isWithinVenueEventWindow(laOct(8, 19, 0), event, LA)).toBe(false);
    });

    it("is false on the day before, even at the same clock time", () => {
      expect(isWithinVenueEventWindow(laOct(6, 19, 0), event, LA)).toBe(false);
    });

    it("judges the time in the venue's zone, not the caller's", () => {
      // 9:30 PM in New York is 6:30 PM in LA: inside the window for an LA store.
      const nyEvening = Date.UTC(2026, 9, 8, 1, 30);
      expect(isWithinVenueEventWindow(nyEvening, event, LA)).toBe(true);
      // The same instant is past the start for a New York store too, but 5:30 PM LA is not.
      expect(isWithinVenueEventWindow(Date.UTC(2026, 9, 8, 0, 30), event, LA)).toBe(false);
    });

    it("lets a weekly event qualify on every matching weekday", () => {
      const weekly = { dayOfWeek: 3, startTime: "18:00" };
      expect(isWithinVenueEventWindow(laOct(7, 19), weekly, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(14, 19), weekly, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(8, 2), weekly, LA)).toBe(true);
      expect(isWithinVenueEventWindow(laOct(8, 19), weekly, LA)).toBe(false);
    });

    it("fails closed on bad input", () => {
      expect(isWithinVenueEventWindow(laOct(7, 19), event, "Not/AZone")).toBe(false);
      expect(isWithinVenueEventWindow(laOct(7, 19), { ...event, startTime: "soon" }, LA)).toBe(false);
      expect(isWithinVenueEventWindow(laOct(7, 19), { startTime: "18:00" }, LA)).toBe(false);
      expect(isWithinVenueEventWindow(Number.NaN, event, LA)).toBe(false);
    });
  });

  describe("playersAlreadyAwarded", () => {
    it("collects players with a bonus in any earlier round", () => {
      const awarded = playersAlreadyAwarded([
        [
          { playerId: "a", venueBonus: 10 },
          { playerId: "b", venueBonus: 0 },
        ],
        [{ playerId: "c", venueBonus: 10 }],
      ]);
      expect([...awarded].sort()).toEqual(["a", "c"]);
    });

    it("treats rounds recorded before the bonus existed as unpaid", () => {
      expect(playersAlreadyAwarded([[{ playerId: "a" }, { playerId: "b" }]]).size).toBe(0);
    });

    it("returns an empty set for no rounds", () => {
      expect(playersAlreadyAwarded([]).size).toBe(0);
    });
  });

  describe("applyVenueBonus", () => {
    const scored = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 2 },
      { playerId: "c", placement: 3 },
    ]);
    const basePoints = Object.fromEntries(scored.map((s) => [s.playerId, s.pointsAwarded]));

    it("adds the bonus to every player in an eligible round", () => {
      const result = applyVenueBonus(scored, true, new Set());
      for (const r of result) {
        expect(r.venueBonus).toBe(VENUE_EVENT_BONUS);
        expect(r.pointsAwarded).toBe(basePoints[r.playerId] + VENUE_EVENT_BONUS);
      }
    });

    it("leaves standings and outcomes untouched", () => {
      const result = applyVenueBonus(scored, true, new Set());
      expect(result.map((r) => [r.playerId, r.placement, r.outcome])).toEqual(
        scored.map((s) => [s.playerId, s.placement, s.outcome])
      );
    });

    it("pays nothing when the round is not eligible", () => {
      const result = applyVenueBonus(scored, false, new Set());
      for (const r of result) {
        expect(r.venueBonus).toBe(0);
        expect(r.pointsAwarded).toBe(basePoints[r.playerId]);
      }
    });

    it("skips players who already had it, but still pays a late joiner", () => {
      const result = applyVenueBonus(scored, true, new Set(["a", "b"]));
      const byId = Object.fromEntries(result.map((r) => [r.playerId, r]));
      expect(byId.a.venueBonus).toBe(0);
      expect(byId.b.venueBonus).toBe(0);
      expect(byId.c.venueBonus).toBe(VENUE_EVENT_BONUS);
      expect(byId.c.pointsAwarded).toBe(basePoints.c + VENUE_EVENT_BONUS);
    });

    it("pays each player exactly once across several rounds", () => {
      const rounds: ReturnType<typeof applyVenueBonus>[] = [];
      for (let i = 0; i < 4; i++) {
        rounds.push(applyVenueBonus(scored, true, playersAlreadyAwarded(rounds)));
      }
      const totalBonus = (id: string) =>
        rounds.flat().filter((r) => r.playerId === id).reduce((sum, r) => sum + r.venueBonus, 0);
      expect(totalBonus("a")).toBe(VENUE_EVENT_BONUS);
      expect(totalBonus("b")).toBe(VENUE_EVENT_BONUS);
      expect(totalBonus("c")).toBe(VENUE_EVENT_BONUS);
    });

    it("does not mutate its input and handles an empty round", () => {
      applyVenueBonus(scored, true, new Set());
      expect(scored.map((s) => s.pointsAwarded)).toEqual(Object.values(basePoints));
      expect(applyVenueBonus([], true, new Set())).toEqual([]);
    });
  });

  describe("storeEventOptions", () => {
    const makeEvent = (overrides: Partial<LocalEvent>): LocalEvent => ({
      id: "e",
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
    const TODAY = "2026-10-07";

    it("offers dated events for the chosen game and format, soonest first", () => {
      const events = [
        makeEvent({ id: "later", eventDate: "2026-10-09" }),
        makeEvent({ id: "today-late", eventDate: "2026-10-07", startTime: "18:00:00" }),
        makeEvent({ id: "today-early", eventDate: "2026-10-07", startTime: "15:00:00" }),
      ];
      expect(storeEventOptions(events, "mtg", "Commander", TODAY).map((o) => o.event.id)).toEqual([
        "today-early",
        "today-late",
        "later",
      ]);
    });

    it("gives each option the form's date offset and 12-hour time", () => {
      const [afternoon] = storeEventOptions(
        [makeEvent({ eventDate: "2026-10-09", startTime: "17:30:00" })],
        "mtg",
        "Commander",
        TODAY
      );
      expect(afternoon).toMatchObject({ dateOffset: 2, hour: 5, minute: 30, period: "PM" });

      const pick = (startTime: string) =>
        storeEventOptions([makeEvent({ eventDate: TODAY, startTime })], "mtg", "Commander", TODAY)[0];
      expect(pick("00:00:00")).toMatchObject({ hour: 12, minute: 0, period: "AM" });
      expect(pick("12:00:00")).toMatchObject({ hour: 12, minute: 0, period: "PM" });
      expect(pick("09:05:00")).toMatchObject({ hour: 9, minute: 5, period: "AM" });
    });

    it("counts offsets across a month boundary", () => {
      const [option] = storeEventOptions(
        [makeEvent({ eventDate: "2026-11-02" })],
        "mtg",
        "Commander",
        "2026-10-28"
      );
      expect(option.dateOffset).toBe(5);
    });

    it("leaves out other formats and games, comparing format case-insensitively", () => {
      const events = [
        makeEvent({ id: "draft", eventDate: TODAY, format: "Booster Draft" }),
        makeEvent({ id: "pokemon", eventDate: TODAY, gameType: "pokemon" }),
        makeEvent({ id: "match", eventDate: TODAY, format: "commander" }),
      ];
      expect(storeEventOptions(events, "mtg", "Commander", TODAY).map((o) => o.event.id)).toEqual(["match"]);
    });

    it("leaves out past events, events beyond the 15-day range, and weekly events", () => {
      const events = [
        makeEvent({ id: "yesterday", eventDate: "2026-10-06" }),
        makeEvent({ id: "last-day", eventDate: "2026-10-21" }),
        makeEvent({ id: "too-far", eventDate: "2026-10-22" }),
        makeEvent({ id: "weekly", dayOfWeek: 3 }),
      ];
      expect(storeEventOptions(events, "mtg", "Commander", TODAY).map((o) => o.event.id)).toEqual([
        "last-day",
      ]);
    });

    it("skips an unparseable start time and respects the limit", () => {
      const bad = makeEvent({ id: "bad", eventDate: TODAY, startTime: "soon" });
      const many = Array.from({ length: 20 }, (_, i) =>
        makeEvent({ id: `e${i}`, venueName: `Venue ${String(i).padStart(2, "0")}`, eventDate: TODAY })
      );
      expect(storeEventOptions([bad], "mtg", "Commander", TODAY)).toEqual([]);
      expect(storeEventOptions(many, "mtg", "Commander", TODAY)).toHaveLength(12);
      expect(storeEventOptions(many, "mtg", "Commander", TODAY, 3)).toHaveLength(3);
      expect(storeEventOptions([], "mtg", "Commander", TODAY)).toEqual([]);
    });
  });
});
