import { describe, expect, it } from "@jest/globals";
import { calendarLocation } from "./calendar-utils";

describe("calendarLocation", () => {
  it("returns a saved city unchanged apart from surrounding spaces", () => {
    expect(calendarLocation("Reno, NV")).toBe("Reno, NV");
    expect(calendarLocation("  Reno, NV  ")).toBe("Reno, NV");
  });

  it("treats a missing or blank location as none", () => {
    expect(calendarLocation(undefined)).toBe("");
    expect(calendarLocation(null)).toBe("");
    expect(calendarLocation("")).toBe("");
    expect(calendarLocation("   ")).toBe("");
  });

  it("treats the old Nearby placeholder as none, in any capitalisation", () => {
    expect(calendarLocation("Nearby")).toBe("");
    expect(calendarLocation("nearby")).toBe("");
    expect(calendarLocation(" NEARBY ")).toBe("");
  });

  it("keeps a real place that merely contains the word", () => {
    expect(calendarLocation("Nearby Springs, CO")).toBe("Nearby Springs, CO");
  });
});
