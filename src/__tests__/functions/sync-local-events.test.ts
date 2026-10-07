import { describe, expect, it } from "@jest/globals";
import {
  cleanText,
  formatAddress,
  formatLabel,
  mapEventsToRows,
  toVenueLocal,
} from "../../../supabase/functions/sync-local-events/mapping";
import { fetchAllPages } from "../../../supabase/functions/sync-local-events/wizards";

// The Edge Function runs on Deno, but its mapping and paging logic is plain TypeScript with no
// Deno-only imports, so it can be exercised here. index.ts (Deno.serve + the database calls) is
// not covered by these tests.

const area = {
  id: "reno-sparks",
  latitude: 39.5296,
  longitude: -119.8138,
  radiusMeters: 25000,
  timeZone: "America/Los_Angeles",
};
const SYNCED_AT = "2026-10-06T19:00:00.000Z";

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "100",
  title: "Casual Commander",
  description: "Drop by and play.",
  format: "COMMANDER",
  scheduledStartTime: "2026-10-07T00:30:00.0000000Z",
  status: "SCHEDULED",
  organization: { id: "1", name: "Test Game Store" },
  eventFormat: { name: "Commander" },
  ...overrides,
});

const stores = [
  { id: "1", name: "Test Game Store", postalAddress: "123 Example St, Reno, NV, 89501, United States" },
];

describe("sync-local-events mapping", () => {
  describe("toVenueLocal", () => {
    it("puts an evening event on the venue's date, which is the day before its UTC date", () => {
      // 00:30 UTC on Oct 7 is 5:30 PM Pacific Daylight Time on Oct 6.
      expect(toVenueLocal("2026-10-07T00:30:00.0000000Z", "America/Los_Angeles")).toEqual({
        date: "2026-10-06",
        time: "17:30:00",
      });
    });

    it("follows daylight saving instead of using a fixed offset", () => {
      // The same 02:00 UTC is 7 PM in October (PDT, UTC-7) but 6 PM in December (PST, UTC-8).
      expect(toVenueLocal("2026-10-10T02:00:00Z", "America/Los_Angeles")?.time).toBe("19:00:00");
      expect(toVenueLocal("2026-12-12T02:00:00Z", "America/Los_Angeles")).toEqual({
        date: "2026-12-11",
        time: "18:00:00",
      });
    });

    it("uses the given zone, not the machine's", () => {
      expect(toVenueLocal("2026-10-07T00:30:00Z", "America/New_York")).toEqual({
        date: "2026-10-06",
        time: "20:30:00",
      });
    });

    it("writes midnight as 00:00, never 24:00", () => {
      expect(toVenueLocal("2026-10-07T07:00:00Z", "America/Los_Angeles")).toEqual({
        date: "2026-10-07",
        time: "00:00:00",
      });
    });

    it("returns null for a missing or unparseable timestamp", () => {
      expect(toVenueLocal(null, "America/Los_Angeles")).toBeNull();
      expect(toVenueLocal("", "America/Los_Angeles")).toBeNull();
      expect(toVenueLocal("not a date", "America/Los_Angeles")).toBeNull();
    });
  });

  describe("cleanText", () => {
    it("collapses whitespace and trims", () => {
      expect(cleanText("  Drop by\n\n every   Tuesday \t", 100)).toBe("Drop by every Tuesday");
    });

    it("cuts overlong text to the cap, ending in an ellipsis", () => {
      const cut = cleanText("a".repeat(50), 10);
      expect(cut).toHaveLength(10);
      expect(cut.endsWith("…")).toBe(true);
    });

    it("leaves text exactly at the cap alone and returns '' for null or blank input", () => {
      expect(cleanText("abcde", 5)).toBe("abcde");
      expect(cleanText(null, 5)).toBe("");
      expect(cleanText(undefined, 5)).toBe("");
      expect(cleanText("   ", 5)).toBe("");
    });
  });

  describe("formatAddress", () => {
    it("drops a trailing country in any of the forms the locator uses", () => {
      expect(formatAddress("675 Holcomb Ave, Reno, NV, 89501, United States")).toBe(
        "675 Holcomb Ave, Reno, NV, 89501"
      );
      expect(formatAddress("2308 Oddie Blvd, Sparks, NV, 89431, US")).toBe(
        "2308 Oddie Blvd, Sparks, NV, 89431"
      );
      expect(formatAddress("5116 Meadowood Mall Cir, Reno, NV, 89502-6502, USA")).toBe(
        "5116 Meadowood Mall Cir, Reno, NV, 89502-6502"
      );
    });

    it("leaves an address with no country alone and returns '' for null", () => {
      expect(formatAddress("123 Example St, Reno, NV")).toBe("123 Example St, Reno, NV");
      expect(formatAddress(null)).toBe("");
    });
  });

  describe("formatLabel", () => {
    it("uses the locator's readable format name", () => {
      expect(
        formatLabel(makeEvent({ format: "SEALED_DECK", eventFormat: { name: "Sealed Deck" } }))
      ).toBe("Sealed Deck");
    });

    it("tidies the format code when the readable name is missing", () => {
      expect(formatLabel(makeEvent({ format: "BOOSTER_DRAFT", eventFormat: null }))).toBe(
        "Booster Draft"
      );
      expect(formatLabel(makeEvent({ format: "STANDARD", eventFormat: { name: "  " } }))).toBe(
        "Standard"
      );
    });

    it("returns null for OTHER and for a missing or blank format", () => {
      expect(
        formatLabel(makeEvent({ format: "OTHER", eventFormat: { name: "Board Games" } }))
      ).toBeNull();
      expect(formatLabel(makeEvent({ format: null }))).toBeNull();
      expect(formatLabel(makeEvent({ format: "  " }))).toBeNull();
    });
  });

  describe("mapEventsToRows", () => {
    it("maps a scheduled Commander event into a feed row", () => {
      expect(mapEventsToRows([makeEvent()], stores, area, SYNCED_AT)).toEqual([
        {
          area: "reno-sparks",
          venue_name: "Test Game Store",
          address: "123 Example St, Reno, NV, 89501",
          game_type: "mtg",
          format: "Commander",
          event_date: "2026-10-06",
          start_time: "17:30:00",
          title: "Casual Commander",
          notes: "Drop by and play.",
          source: "feed",
          external_uid: "wizards:100",
          active: true,
          updated_at: SYNCED_AT,
        },
      ]);
    });

    it("keeps every Magic format, labelled by the locator's format name", () => {
      const events = [
        makeEvent({ id: "1" }),
        makeEvent({ id: "2", format: "BOOSTER_DRAFT", eventFormat: { name: "Booster Draft" } }),
        makeEvent({ id: "3", format: "PAUPER", eventFormat: { name: "Pauper" } }),
      ];
      expect(mapEventsToRows(events, stores, area, SYNCED_AT).map((r) => r.format)).toEqual([
        "Commander",
        "Booster Draft",
        "Pauper",
      ]);
    });

    it("skips events that are not scheduled, are non-Magic (OTHER), or have no format", () => {
      const events = [
        makeEvent({ id: "1", status: "CANCELED" }),
        makeEvent({ id: "2", status: null }),
        makeEvent({ id: "3", format: "OTHER", eventFormat: { name: "Dungeons and Dragons Event" } }),
        makeEvent({ id: "4", format: null, eventFormat: null }),
        makeEvent({ id: "5" }),
      ];
      expect(mapEventsToRows(events, stores, area, SYNCED_AT).map((r) => r.external_uid)).toEqual([
        "wizards:5",
      ]);
    });

    it("skips events with no venue, no id, or an unusable start time", () => {
      const events = [
        makeEvent({ id: "1", organization: null }),
        makeEvent({ id: "", }),
        makeEvent({ id: "3", scheduledStartTime: null }),
        makeEvent({ id: "4", scheduledStartTime: "garbage" }),
      ];
      expect(mapEventsToRows(events, stores, area, SYNCED_AT)).toEqual([]);
    });

    it("keeps only the first of two events sharing an id", () => {
      const events = [makeEvent({ title: "First" }), makeEvent({ title: "Second" })];
      const rows = mapEventsToRows(events, stores, area, SYNCED_AT);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("First");
    });

    it("still maps an event whose store is not in the store list, with an empty address", () => {
      const event = makeEvent({ organization: { id: "999", name: "Unlisted Shop" } });
      const [row] = mapEventsToRows([event], stores, area, SYNCED_AT);
      expect(row.venue_name).toBe("Unlisted Shop");
      expect(row.address).toBe("");
    });

    it("matches store ids whether they arrive as strings or numbers", () => {
      const numericStores = [{ id: 1 as unknown as string, name: "Test Game Store", postalAddress: "1 Main St" }];
      const [row] = mapEventsToRows([makeEvent()], numericStores, area, SYNCED_AT);
      expect(row.address).toBe("1 Main St");
    });

    it("falls back to the format name for a blank title and '' for a missing description", () => {
      const [row] = mapEventsToRows(
        [makeEvent({ title: "   ", description: null })],
        stores,
        area,
        SYNCED_AT
      );
      expect(row.title).toBe("Commander");
      expect(row.notes).toBe("");
    });

    it("caps an oversized description", () => {
      const [row] = mapEventsToRows(
        [makeEvent({ description: "x".repeat(5000) })],
        stores,
        area,
        SYNCED_AT
      );
      expect(row.notes.length).toBe(500);
    });

    it("returns an empty array for no events", () => {
      expect(mapEventsToRows([], stores, area, SYNCED_AT)).toEqual([]);
    });
  });
});

describe("sync-local-events fetchAllPages", () => {
  it("returns a single page when it holds everything", async () => {
    const pages: number[] = [];
    const result = await fetchAllPages(async (page) => {
      pages.push(page);
      return { items: [1, 2, 3], total: 3 };
    });
    expect(result).toEqual([1, 2, 3]);
    expect(pages).toEqual([0]);
  });

  it("keeps requesting pages until the reported total is reached", async () => {
    const data = [[1, 2], [3, 4], [5]];
    const result = await fetchAllPages(async (page) => ({ items: data[page], total: 5 }));
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns an empty array when the service reports zero results", async () => {
    expect(await fetchAllPages(async () => ({ items: [], total: 0 }))).toEqual([]);
  });

  it("throws instead of returning a short read", async () => {
    const data: number[][] = [[1, 2], []];
    await expect(
      fetchAllPages(async (page) => ({ items: data[page], total: 5 }))
    ).rejects.toThrow("locator returned 2 of 5 results");
  });

  it("throws when the page cap is hit before everything is read", async () => {
    await expect(
      fetchAllPages(async () => ({ items: [1], total: 1000000 }))
    ).rejects.toThrow(/refusing a partial read/);
  });

  it("propagates a failed page fetch", async () => {
    await expect(
      fetchAllPages(async () => {
        throw new Error("locator responded 503");
      })
    ).rejects.toThrow("locator responded 503");
  });
});
