import { describe, expect, it } from "@jest/globals";
import { searchLocations } from "./location-api";

describe("searchLocations", () => {
  it("returns no results for a query shorter than the minimum length", async () => {
    expect(await searchLocations("")).toEqual([]);
    expect(await searchLocations("s")).toEqual([]);
  });

  it("matches a city by case-insensitive prefix", async () => {
    const results = await searchLocations("seat");
    expect(results.some((r) => r.city === "Seattle" && r.state === "WA")).toBe(true);
  });

  it("matches a full 'city, state' prefix", async () => {
    const results = await searchLocations("seattle, w");
    expect(results.some((r) => r.displayName === "Seattle, WA")).toBe(true);
  });

  it("does not match a city name in the middle of the string", async () => {
    const results = await searchLocations("attle");
    expect(results.some((r) => r.city === "Seattle")).toBe(false);
  });

  it("ranks more-populous matches first", async () => {
    const results = await searchLocations("spring");
    const names = results.map((r) => r.displayName);
    const springfieldIL = names.indexOf("Springfield, IL");
    const springfieldMO = names.indexOf("Springfield, MO");
    expect(springfieldIL).toBeGreaterThanOrEqual(0);
    expect(springfieldMO).toBeGreaterThanOrEqual(0);
    // Springfield, MO (169,176) is more populous than Springfield, IL (114,394).
    expect(springfieldMO).toBeLessThan(springfieldIL);
  });

  it("caps results at 8 suggestions", async () => {
    const results = await searchLocations("san");
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it("returns an empty array for a query with no matches", async () => {
    const results = await searchLocations("zzzznotacity");
    expect(results).toEqual([]);
  });

  it("builds displayName as 'City, ST'", async () => {
    const results = await searchLocations("denver");
    const denver = results.find((r) => r.city === "Denver");
    expect(denver?.displayName).toBe("Denver, CO");
  });
});
