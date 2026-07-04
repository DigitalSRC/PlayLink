import { describe, expect, it } from "@jest/globals";
import { mapProfileToRow, mapRowToProfile } from "./profile-api";

describe("profile-api mappers", () => {
  describe("mapRowToProfile", () => {
    it("converts a full snake_case row into a camelCase UserProfile", () => {
      const row = {
        id: "user-1",
        username: "DarkRitualDave",
        display_name: "Dave",
        is_developer: false,
        location: "Downtown",
        games: ["mtg"],
        preferred_formats: { mtg: ["Commander"] },
        brackets: [2, 3],
        no_go: ["Infinites"],
        wins: 10,
        losses: 5,
        points: 300,
        monthly_points: 120,
      };

      expect(mapRowToProfile(row)).toEqual({
        id: "user-1",
        username: "DarkRitualDave",
        displayName: "Dave",
        isDeveloper: false,
        location: "Downtown",
        games: ["mtg"],
        preferredFormats: { mtg: ["Commander"] },
        brackets: [2, 3],
        noGo: ["Infinites"],
        wins: 10,
        losses: 5,
        points: 300,
        monthlyPoints: 120,
      });
    });

    it("maps a null display_name to undefined", () => {
      const row = {
        id: "user-2",
        username: "NoDisplayName",
        display_name: null,
        is_developer: false,
        location: "",
        games: [],
        preferred_formats: {},
        brackets: [],
        no_go: [],
        wins: 0,
        losses: 0,
        points: 0,
        monthly_points: 0,
      };

      expect(mapRowToProfile(row).displayName).toBeUndefined();
    });
  });

  describe("mapProfileToRow", () => {
    it("converts every camelCase field to its snake_case column", () => {
      const row = mapProfileToRow({
        username: "DarkRitualDave",
        displayName: "Dave",
        isDeveloper: true,
        location: "Downtown",
        games: ["mtg"],
        preferredFormats: { mtg: ["Commander"] },
        brackets: [2, 3],
        noGo: ["Infinites"],
        wins: 10,
        losses: 5,
        points: 300,
        monthlyPoints: 120,
      });

      expect(row).toEqual({
        username: "DarkRitualDave",
        display_name: "Dave",
        is_developer: true,
        location: "Downtown",
        games: ["mtg"],
        preferred_formats: { mtg: ["Commander"] },
        brackets: [2, 3],
        no_go: ["Infinites"],
        wins: 10,
        losses: 5,
        points: 300,
        monthly_points: 120,
      });
    });

    it("only includes fields present on the input, for sparse update patches", () => {
      const row = mapProfileToRow({ points: 50 });
      expect(row).toEqual({ points: 50 });
    });

    it("writes an explicit undefined displayName through as null, not dropped", () => {
      const row = mapProfileToRow({ displayName: undefined, username: "Someone" });
      expect(row).toEqual({ username: "Someone", display_name: null });
    });
  });
});
