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
        draws: 2,
        points: 300,
        monthly_points: 120,
        point_balance: 85,
        title: "Kingmaker",
        name_color: "#3D9BFF",
        card_border: "gold",
        created_at: "2026-06-01T00:00:00.000Z",
        rival_ids: ["user-2"],
        last_rival_refresh: "2026-07-05T19:00:00.000Z",
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
        draws: 2,
        points: 300,
        monthlyPoints: 120,
        pointBalance: 85,
        title: "Kingmaker",
        nameColor: "#3D9BFF",
        cardBorder: "gold",
        createdAt: Date.UTC(2026, 5, 1),
        rivalIds: ["user-2"],
        lastRivalRefresh: "2026-07-05T19:00:00.000Z",
      });
    });

    // A row from before the shop migration has none of the new columns; a player with nothing
    // equipped has them as null. Both must read as "zero points, wearing nothing".
    it("reads a missing or empty balance and look as zero points and nothing worn", () => {
      const base = {
        id: "user-3",
        username: "Plain",
        display_name: null,
        is_developer: false,
        location: "",
        games: [],
        preferred_formats: {},
        brackets: [],
        no_go: [],
        wins: 0,
        losses: 0,
        draws: 0,
        points: 40,
        monthly_points: 10,
        rival_ids: [],
        last_rival_refresh: null,
      };
      for (const row of [base, { ...base, point_balance: 0, title: null, name_color: null, card_border: null }]) {
        const profile = mapRowToProfile(row);
        expect(profile.pointBalance).toBe(0);
        expect(profile.title).toBeUndefined();
        expect(profile.nameColor).toBeUndefined();
        expect(profile.cardBorder).toBeUndefined();
        // Spendable points are separate from all-time points and monthly score.
        expect(profile.points).toBe(40);
        expect(profile.monthlyPoints).toBe(10);
      }
    });

    it("never sends the balance or the look back to the server", () => {
      const row = mapProfileToRow({
        username: "Cheat",
        pointBalance: 99999,
        title: "Living Legend",
        nameColor: "#D9A520",
        cardBorder: "gold",
        createdAt: 0,
      });
      expect(row).toEqual({ username: "Cheat" });
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
        draws: 0,
        points: 0,
        monthly_points: 0,
        rival_ids: [],
        last_rival_refresh: null,
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
        draws: 2,
        points: 300,
        monthlyPoints: 120,
        rivalIds: ["user-2"],
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
        draws: 2,
        points: 300,
        monthly_points: 120,
        rival_ids: ["user-2"],
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
