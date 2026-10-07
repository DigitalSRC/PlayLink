import { describe, expect, it } from "@jest/globals";
import { LocalEvent } from "../data/local-events";
import { computePlacementScores } from "./scoring-utils";
import {
  applyVenueBonus,
  isWithinVenueEventWindow,
  parseStoreEventLink,
  playersAlreadyAwarded,
  storeEventLinkParams,
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

  describe("store-event links", () => {
    const makeEvent = (overrides: Partial<LocalEvent>): LocalEvent => ({
      id: "e1",
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
    const link = (overrides: Partial<LocalEvent> = {}, dateKey = "2026-10-09") =>
      storeEventLinkParams(makeEvent(overrides), dateKey);

    it("carries the event to the create form and opens it", () => {
      expect(link()).toEqual({
        openCreate: "1",
        storeEventId: "e1",
        storeEventVenue: "Test Venue",
        storeEventDate: "2026-10-09",
        storeEventStart: "18:00:00",
        storeEventGame: "mtg",
        storeEventFormat: "Commander",
      });
    });

    it("round-trips into a link with the date offset and 12-hour start time", () => {
      expect(parseStoreEventLink(link({ startTime: "17:30:00" }), TODAY)).toEqual({
        eventId: "e1",
        venueName: "Test Venue",
        gameType: "mtg",
        format: "Commander",
        dateKey: "2026-10-09",
        dateOffset: 2,
        hour: 5,
        minute: 30,
        period: "PM",
      });
    });

    it("converts noon, midnight, and morning start times", () => {
      const at = (startTime: string) => parseStoreEventLink(link({ startTime }, TODAY), TODAY);
      expect(at("12:00:00")).toMatchObject({ hour: 12, minute: 0, period: "PM" });
      expect(at("00:15:00")).toMatchObject({ hour: 12, minute: 15, period: "AM" });
      expect(at("09:05")).toMatchObject({ hour: 9, minute: 5, period: "AM" });
    });

    it("pins a weekly event to the night it was listed under", () => {
      const weekly = link({ dayOfWeek: 3 }, "2026-10-14");
      expect(parseStoreEventLink(weekly, TODAY)).toMatchObject({ dateKey: "2026-10-14", dateOffset: 7 });
    });

    it("counts the offset across a month boundary and allows today", () => {
      expect(parseStoreEventLink(link({}, "2026-11-02"), TODAY)?.dateOffset).toBe(26);
      expect(parseStoreEventLink(link({}, TODAY), TODAY)?.dateOffset).toBe(0);
    });

    it("rejects a night that has passed or is more than 31 days out", () => {
      expect(parseStoreEventLink(link({}, "2026-10-06"), TODAY)).toBeNull();
      expect(parseStoreEventLink(link({}, "2026-11-07"), TODAY)).not.toBeNull();
      expect(parseStoreEventLink(link({}, "2026-11-08"), TODAY)).toBeNull();
    });

    it("rejects dates that aren't real calendar days", () => {
      expect(parseStoreEventLink(link({}, "2026-10-32"), TODAY)).toBeNull();
      expect(parseStoreEventLink(link({}, "2026-02-31"), "2026-02-20")).toBeNull();
      expect(parseStoreEventLink(link({}, "10/09/2026"), TODAY)).toBeNull();
      expect(parseStoreEventLink(link(), "not-a-date")).toBeNull();
    });

    it("rejects a link with a missing, blank, or repeated field", () => {
      const fields = ["storeEventId", "storeEventVenue", "storeEventDate", "storeEventStart", "storeEventGame", "storeEventFormat"];
      for (const field of fields) {
        const { [field]: _dropped, ...missing } = link();
        expect(parseStoreEventLink(missing, TODAY)).toBeNull();
        expect(parseStoreEventLink({ ...link(), [field]: "   " }, TODAY)).toBeNull();
        expect(parseStoreEventLink({ ...link(), [field]: [link()[field], "x"] }, TODAY)).toBeNull();
      }
      expect(parseStoreEventLink({}, TODAY)).toBeNull();
      expect(parseStoreEventLink({ openCreate: "1" }, TODAY)).toBeNull();
    });

    it("rejects an unknown game and an unparseable start time", () => {
      expect(parseStoreEventLink({ ...link(), storeEventGame: "chess" }, TODAY)).toBeNull();
      expect(parseStoreEventLink({ ...link(), storeEventGame: "toString" }, TODAY)).toBeNull();
      expect(parseStoreEventLink(link({ startTime: "soon" }), TODAY)).toBeNull();
      expect(parseStoreEventLink(link({ startTime: "24:00:00" }), TODAY)).toBeNull();
      expect(parseStoreEventLink(link({ startTime: "18:60:00" }), TODAY)).toBeNull();
    });

    it("trims stray whitespace and keeps a non-Commander format as written", () => {
      const parsed = parseStoreEventLink(
        { ...link({ format: "Booster Draft" }), storeEventVenue: "  Test Venue  " },
        TODAY
      );
      expect(parsed).toMatchObject({ venueName: "Test Venue", format: "Booster Draft" });
    });
  });
});
