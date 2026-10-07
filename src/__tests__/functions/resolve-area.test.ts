import { describe, expect, it } from "@jest/globals";
import {
  areaLabel,
  areaSlug,
  findContainingArea,
  GeocodedPlace,
  haversineMeters,
  parseLocation,
  pickPlace,
} from "../../../supabase/functions/resolve-area/logic";

// The pure half of the resolve-area Edge Function. index.ts (auth, the geocoder call, and the
// database writes) is not covered here; it was exercised against the live project instead.

const place = (overrides: Partial<GeocodedPlace> = {}): GeocodedPlace => ({
  id: 1,
  name: "Reno",
  latitude: 39.5296,
  longitude: -119.8138,
  timezone: "America/Los_Angeles",
  country_code: "US",
  country: "United States",
  admin1: "Nevada",
  population: 250000,
  ...overrides,
});

const sparksNevada = place({ id: 2, name: "Sparks", latitude: 39.53491, longitude: -119.75269, population: 96094 });
const sparksGeorgia = place({ id: 3, name: "Sparks", latitude: 31.16686, longitude: -83.43738, admin1: "Georgia", timezone: "America/New_York", population: 2007 });

describe("resolve-area logic", () => {
  describe("parseLocation", () => {
    it("splits a 'City, ST' location and expands the state abbreviation", () => {
      expect(parseLocation("Reno, NV")).toEqual({ queries: ["Reno"], regionHint: "Nevada" });
      expect(parseLocation("reno, nv")).toEqual({ queries: ["reno"], regionHint: "Nevada" });
    });

    it("keeps a hint that is not a US abbreviation as typed", () => {
      expect(parseLocation("Toronto, Canada")).toEqual({ queries: ["Toronto"], regionHint: "Canada" });
      expect(parseLocation("Sparks, Nevada")).toEqual({ queries: ["Sparks"], regionHint: "Nevada" });
    });

    it("has no hint when there is no comma", () => {
      expect(parseLocation("Sparks")).toEqual({ queries: ["Sparks"], regionHint: null });
    });

    it("offers shorter fallbacks with leading words dropped, capped at three", () => {
      expect(parseLocation("Downtown Seattle")?.queries).toEqual(["Downtown Seattle", "Seattle"]);
      expect(parseLocation("Old Town North Las Vegas")?.queries).toEqual([
        "Old Town North Las Vegas",
        "Town North Las Vegas",
        "North Las Vegas",
      ]);
    });

    it("collapses whitespace and uses the first non-empty part after the comma", () => {
      expect(parseLocation("  Carson   City ,, NV ")).toEqual({
        queries: ["Carson City", "City"],
        regionHint: "Nevada",
      });
    });

    it("returns null for empty, too-short, too-long, or nameless text", () => {
      expect(parseLocation("")).toBeNull();
      expect(parseLocation("   ")).toBeNull();
      expect(parseLocation("a")).toBeNull();
      expect(parseLocation(",NV")).toBeNull();
      expect(parseLocation("x".repeat(101))).toBeNull();
      expect(parseLocation("x".repeat(100))).not.toBeNull();
    });
  });

  describe("pickPlace", () => {
    it("picks the most populous place when there is no hint", () => {
      expect(pickPlace([sparksGeorgia, sparksNevada], null)?.id).toBe(2);
    });

    it("only accepts places in the hinted state or country", () => {
      expect(pickPlace([sparksNevada, sparksGeorgia], "Georgia")?.id).toBe(3);
      expect(pickPlace([sparksNevada, sparksGeorgia], "georgia")?.id).toBe(3);
      expect(pickPlace([sparksNevada, sparksGeorgia], "United States")?.id).toBe(2);
      expect(pickPlace([sparksNevada, sparksGeorgia], "us")?.id).toBe(2);
    });

    it("returns null rather than a same-named place somewhere else", () => {
      expect(pickPlace([sparksNevada, sparksGeorgia], "Narnia")).toBeNull();
      expect(pickPlace([sparksGeorgia], "Nevada")).toBeNull();
    });

    it("ignores places with no coordinates, time zone, or name", () => {
      const broken = [
        place({ id: 10, latitude: Number.NaN }),
        place({ id: 11, timezone: "" }),
        place({ id: 12, name: "  " }),
      ];
      expect(pickPlace(broken, null)).toBeNull();
      expect(pickPlace([...broken, sparksGeorgia], null)?.id).toBe(3);
    });

    it("returns null for an empty list and treats missing population as zero", () => {
      expect(pickPlace([], null)).toBeNull();
      const noPop = place({ id: 20, population: undefined });
      expect(pickPlace([noPop, sparksGeorgia], null)?.id).toBe(3);
      expect(pickPlace([noPop], null)?.id).toBe(20);
    });
  });

  describe("haversineMeters", () => {
    it("is zero for identical points", () => {
      expect(haversineMeters(39.5296, -119.8138, 39.5296, -119.8138)).toBe(0);
    });

    it("matches known city-scale distances", () => {
      // Reno to Sparks is a little over 5 km; Reno to Carson City is about 40 km.
      const renoToSparks = haversineMeters(39.5296, -119.8138, 39.53491, -119.75269);
      expect(renoToSparks).toBeGreaterThan(4500);
      expect(renoToSparks).toBeLessThan(6000);
      const renoToCarson = haversineMeters(39.5296, -119.8138, 39.1638, -119.7674);
      expect(renoToCarson).toBeGreaterThan(38000);
      expect(renoToCarson).toBeLessThan(43000);
    });
  });

  describe("findContainingArea", () => {
    const reno = { id: "reno-sparks", latitude: 39.5296, longitude: -119.8138, radius_meters: 25000 };
    const carson = { id: "carson", latitude: 39.1638, longitude: -119.7674, radius_meters: 25000 };

    it("puts Sparks in the Reno-Sparks area", () => {
      expect(findContainingArea([reno], 39.53491, -119.75269)?.id).toBe("reno-sparks");
    });

    it("returns null for a point outside every area", () => {
      expect(findContainingArea([reno], 38.5816, -121.4944)).toBeNull();
      expect(findContainingArea([], 39.5296, -119.8138)).toBeNull();
    });

    it("picks the nearest center when circles overlap", () => {
      // A point between the two, closer to Carson City.
      expect(findContainingArea([reno, carson], 39.3, -119.78)?.id).toBe("carson");
      expect(findContainingArea([carson, reno], 39.45, -119.8)?.id).toBe("reno-sparks");
    });
  });

  describe("areaSlug", () => {
    it("builds a lowercase hyphenated id that satisfies the database's slug rule", () => {
      const rule = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      const samples = [
        place({ name: "Sacramento", admin1: "California" }),
        place({ name: "Coeur d'Alene", admin1: "Idaho" }),
        place({ name: "St. Louis", admin1: "Missouri" }),
        place({ name: "Montréal", admin1: "Quebec", country_code: "CA" }),
        place({ name: "Winston-Salem", admin1: "North Carolina" }),
      ];
      for (const sample of samples) expect(areaSlug(sample)).toMatch(rule);
      expect(areaSlug(samples[0])).toBe("sacramento-california-us");
      expect(areaSlug(samples[1])).toBe("coeur-d-alene-idaho-us");
      expect(areaSlug(samples[3])).toBe("montreal-quebec-ca");
    });

    it("leaves out missing parts", () => {
      expect(areaSlug(place({ name: "Singapore", admin1: undefined, country_code: "SG" }))).toBe("singapore-sg");
    });

    it("falls back to the geocoder id when the name has no usable characters", () => {
      expect(areaSlug(place({ id: 77, name: "東京", admin1: undefined, country_code: undefined }))).toBe("area-77");
    });

    it("caps very long names without leaving a trailing hyphen", () => {
      const slug = areaSlug(place({ name: "a".repeat(79) + " b", admin1: "x" }));
      expect(slug.length).toBeLessThanOrEqual(80);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });
  });

  describe("areaLabel", () => {
    it("uses the two-letter state for US places", () => {
      expect(areaLabel(place({ name: "Sacramento", admin1: "California" }))).toBe("Sacramento, CA");
    });

    it("uses the country for places outside the US", () => {
      expect(
        areaLabel(place({ name: "Toronto", admin1: "Ontario", country_code: "CA", country: "Canada" }))
      ).toBe("Toronto, Canada");
    });

    it("falls back to the full state name, then to the bare city", () => {
      expect(areaLabel(place({ name: "San Juan", admin1: "Puerto Rico" }))).toBe("San Juan, Puerto Rico");
      expect(
        areaLabel(place({ name: "Atlantis", admin1: undefined, country: undefined, country_code: undefined }))
      ).toBe("Atlantis");
    });
  });
});
