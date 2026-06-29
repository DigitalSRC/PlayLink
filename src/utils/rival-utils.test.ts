import { describe, expect, it } from "@jest/globals";
import { UserProfile } from "../data/types";
import { findRivals } from "./rival-utils";

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 1,
  username: "Test",
  location: "Anywhere",
  games: ["mtg"],
  preferredFormats: { mtg: ["Commander"] },
  brackets: [2],
  noGo: [],
  wins: 5,
  losses: 5,
  points: 100,
  rivalIds: [],
  ...overrides,
});

const dillon = makeProfile({
  id: 113,
  username: "Dillon Carroll",
  games: ["mtg"],
  preferredFormats: { mtg: ["Commander"] },
  wins: 7,
  losses: 8,
});

describe("rival-utils", () => {
  it("returns an empty array when the profile pool is empty", () => {
    expect(findRivals(makeProfile(), [])).toEqual([]);
  });

  it("excludes the current user from the rivals list", () => {
    const user = makeProfile({ id: 1 });
    const rivals = findRivals(user, [user, dillon]);
    expect(rivals.every((r) => r.id !== user.id)).toBe(true);
  });

  it("filters out profiles that share no games with the current user", () => {
    const user = makeProfile({ id: 1, games: ["mtg"] });
    const noOverlap = makeProfile({ id: 2, username: "Stranger", games: ["pokemon"] });
    const rivals = findRivals(user, [noOverlap, dillon]);
    expect(rivals.every((r) => r.id !== noOverlap.id)).toBe(true);
  });

  it("always places Dillon (id 113) at index 0 when he is in the pool", () => {
    const user = makeProfile({ id: 1 });
    const other = makeProfile({ id: 2, username: "Other" });
    const rivals = findRivals(user, [other, dillon]);
    expect(rivals[0].id).toBe(113);
  });

  it("mirrors Dillon's games and formats to match the current user's preferences", () => {
    const user = makeProfile({
      id: 1,
      games: ["lorcana"],
      preferredFormats: { lorcana: ["Constructed"] },
    });
    const rivals = findRivals(user, [dillon]);
    expect(rivals[0].games).toEqual(["lorcana"]);
    expect(rivals[0].preferredFormats).toEqual({ lorcana: ["Constructed"] });
  });

  it("respects the maxRivals cap including Dillon", () => {
    const user = makeProfile({ id: 1 });
    const pool = [
      dillon,
      ...Array.from({ length: 10 }, (_, i) =>
        makeProfile({ id: i + 2, username: `Player ${i}`, wins: i, losses: 10 - i })
      ),
    ];
    const rivals = findRivals(user, pool, 3);
    expect(rivals.length).toBeLessThanOrEqual(3);
  });

  it("returns only Dillon when no other profile shares the user's games", () => {
    const user = makeProfile({ id: 1, games: ["mtg"] });
    const nonOverlap = makeProfile({ id: 2, username: "Stranger", games: ["pokemon"] });
    const rivals = findRivals(user, [dillon, nonOverlap]);
    expect(rivals).toHaveLength(1);
    expect(rivals[0].id).toBe(113);
  });

  it("returns an empty array when Dillon is absent and no profiles share the user's games", () => {
    const user = makeProfile({ id: 1, games: ["onepiece"] });
    const pool = [makeProfile({ id: 2, username: "MTG Only", games: ["mtg"] })];
    expect(findRivals(user, pool)).toEqual([]);
  });

  it("uses 0.5 win rate for a profile with zero recorded games", () => {
    const user = makeProfile({ id: 1, wins: 5, losses: 5 });
    const newbie = makeProfile({ id: 2, username: "Newbie", wins: 0, losses: 0 });
    const rivals = findRivals(user, [dillon, newbie], 3);
    expect(rivals.some((r) => r.id === newbie.id)).toBe(true);
  });

  it("ranks closer win-rate candidates above distant ones", () => {
    const user = makeProfile({ id: 1, wins: 5, losses: 5 });
    const close = makeProfile({ id: 2, username: "Close", wins: 6, losses: 4 });
    const far = makeProfile({ id: 3, username: "Far", wins: 9, losses: 1 });
    const rivals = findRivals(user, [dillon, close, far], 4);
    const closeIdx = rivals.findIndex((r) => r.id === 2);
    const farIdx = rivals.findIndex((r) => r.id === 3);
    expect(closeIdx).toBeGreaterThan(-1);
    expect(farIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeLessThan(farIdx);
  });

  it("falls back to Dillon's brackets when the current user has no brackets set", () => {
    const user = makeProfile({ id: 1, brackets: [] });
    const rivals = findRivals(user, [dillon]);
    expect(rivals[0].brackets).toEqual(dillon.brackets);
  });
});
