import { describe, expect, it } from "@jest/globals";
import { UserProfile } from "../data/types";
import { findRivals, MAX_RIVALS, pickChosenRival, RIVAL_SEARCH_INTERVAL_MS, shouldShowNoRivalBanner, topUpRivalIds } from "./rival-utils";

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: '1',
  username: "Test",
  location: "Anywhere",
  games: ["mtg"],
  preferredFormats: { mtg: ["Commander"] },
  brackets: [2],
  noGo: [],
  wins: 5,
  losses: 5,
  draws: 0,
  points: 100,
  monthlyPoints: 0,
  pointBalance: 0,
  rivalIds: [],
  ...overrides,
});

const dillon = makeProfile({
  id: '113',
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
    const user = makeProfile({ id: '1' });
    const rivals = findRivals(user, [user, dillon]);
    expect(rivals.every((r) => r.id !== user.id)).toBe(true);
  });

  it("filters out profiles that share no games with the current user", () => {
    const user = makeProfile({ id: '1', games: ["mtg"] });
    const noOverlap = makeProfile({ id: '2', username: "Stranger", games: ["pokemon"] });
    const rivals = findRivals(user, [noOverlap, dillon]);
    expect(rivals.every((r) => r.id !== noOverlap.id)).toBe(true);
  });

  it("always places Dillon (id 113) at index 0 when he is in the pool", () => {
    const user = makeProfile({ id: '1' });
    const other = makeProfile({ id: '2', username: "Other" });
    const rivals = findRivals(user, [other, dillon]);
    expect(rivals[0].id).toBe('113');
  });

  it("mirrors Dillon's games and formats to match the current user's preferences", () => {
    const user = makeProfile({
      id: '1',
      games: ["lorcana"],
      preferredFormats: { lorcana: ["Constructed"] },
    });
    const rivals = findRivals(user, [dillon]);
    expect(rivals[0].games).toEqual(["lorcana"]);
    expect(rivals[0].preferredFormats).toEqual({ lorcana: ["Constructed"] });
  });

  it("respects the maxRivals cap including Dillon", () => {
    const user = makeProfile({ id: '1' });
    const pool = [
      dillon,
      ...Array.from({ length: 10 }, (_, i) =>
        makeProfile({ id: String(i + 2), username: `Player ${i}`, wins: i, losses: 10 - i })
      ),
    ];
    const rivals = findRivals(user, pool, 3);
    expect(rivals.length).toBeLessThanOrEqual(3);
  });

  it("returns only Dillon when no other profile shares the user's games", () => {
    const user = makeProfile({ id: '1', games: ["mtg"] });
    const nonOverlap = makeProfile({ id: '2', username: "Stranger", games: ["pokemon"] });
    const rivals = findRivals(user, [dillon, nonOverlap]);
    expect(rivals).toHaveLength(1);
    expect(rivals[0].id).toBe('113');
  });

  it("returns an empty array when Dillon is absent and no profiles share the user's games", () => {
    const user = makeProfile({ id: '1', games: ["onepiece"] });
    const pool = [makeProfile({ id: '2', username: "MTG Only", games: ["mtg"] })];
    expect(findRivals(user, pool)).toEqual([]);
  });

  it("treats a candidate with identical monthly points as a perfect match", () => {
    const user = makeProfile({ id: '1', monthlyPoints: 0 });
    const twin = makeProfile({ id: '2', username: "Twin", monthlyPoints: 0 });
    const rivals = findRivals(user, [dillon, twin], 3);
    expect(rivals.some((r) => r.id === twin.id)).toBe(true);
  });

  it("ranks closer monthly-points candidates above distant ones", () => {
    const user = makeProfile({ id: '1', monthlyPoints: 100 });
    const close = makeProfile({ id: '2', username: "Close", monthlyPoints: 110 });
    const far = makeProfile({ id: '3', username: "Far", monthlyPoints: 900 });
    const rivals = findRivals(user, [dillon, close, far], 4);
    const closeIdx = rivals.findIndex((r) => r.id === '2');
    const farIdx = rivals.findIndex((r) => r.id === '3');
    expect(closeIdx).toBeGreaterThan(-1);
    expect(farIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeLessThan(farIdx);
  });

  it("falls back to Dillon's brackets when the current user has no brackets set", () => {
    const user = makeProfile({ id: '1', brackets: [] });
    const rivals = findRivals(user, [dillon]);
    expect(rivals[0].brackets).toEqual(dillon.brackets);
  });
});

describe("topUpRivalIds", () => {
  const me = makeProfile({ id: "me", monthlyPoints: 50 });
  const a = makeProfile({ id: "a", monthlyPoints: 50 });
  const b = makeProfile({ id: "b", monthlyPoints: 60 });
  const c = makeProfile({ id: "c", monthlyPoints: 90 });
  const d = makeProfile({ id: "d", monthlyPoints: 500 });

  it("allows three rivals", () => {
    expect(MAX_RIVALS).toBe(3);
  });

  it("keeps the rivals a player has, in order, and adds the closest new matches after them", () => {
    expect(topUpRivalIds(me, ["d"], [a, b, c, d])).toEqual(["d", "a", "b"]);
  });

  it("fills every slot for a player with none", () => {
    expect(topUpRivalIds(me, [], [b, c, d])).toEqual(["b", "c", "d"]);
  });

  it("adds only as many as there are open slots", () => {
    expect(topUpRivalIds(me, ["c", "d"], [a, b, c, d])).toEqual(["c", "d", "a"]);
  });

  it("returns null when the list is already full", () => {
    expect(topUpRivalIds(me, ["a", "b", "c"], [a, b, c, d])).toBeNull();
    expect(topUpRivalIds(me, ["a", "b", "c", "d"], [a, b, c, d])).toBeNull();
  });

  it("returns null when the pool has nobody new", () => {
    expect(topUpRivalIds(me, ["a"], [a])).toBeNull();
    expect(topUpRivalIds(me, ["a"], [])).toBeNull();
  });

  it("never adds the player themself, a rival they already have, or someone who shares no game", () => {
    const pokemonOnly = makeProfile({ id: "pk", games: ["pokemon"] });
    expect(topUpRivalIds(me, ["a"], [me, a, pokemonOnly])).toBeNull();
    expect(topUpRivalIds(me, ["a"], [me, a, pokemonOnly, b])).toEqual(["a", "b"]);
  });

  it("keeps a rival who is missing from the pool, and counts a repeated id once", () => {
    expect(topUpRivalIds(me, ["gone", "gone"], [a, b, c])).toEqual(["gone", "a", "b"]);
  });

  it("honours a smaller cap", () => {
    expect(topUpRivalIds(me, ["a"], [a, b, c], 2)).toEqual(["a", "b"]);
    expect(topUpRivalIds(me, ["a"], [a, b, c], 1)).toBeNull();
  });
});

describe("pickChosenRival", () => {
  const rivals = [makeProfile({ id: "a" }), makeProfile({ id: "b" }), makeProfile({ id: "c" })];

  it("takes the first preference that is still a rival", () => {
    expect(pickChosenRival(rivals, ["b", "c"])).toBe("b");
    expect(pickChosenRival(rivals, [null, undefined, "c"])).toBe("c");
  });

  it("skips a preference for someone who is no longer a rival", () => {
    expect(pickChosenRival(rivals, ["gone", "c"])).toBe("c");
  });

  it("falls back to the first rival when no preference holds", () => {
    expect(pickChosenRival(rivals, [])).toBe("a");
    expect(pickChosenRival(rivals, ["gone", null])).toBe("a");
  });

  it("is null for a player with no rivals, whatever was preferred", () => {
    expect(pickChosenRival([], ["a"])).toBeNull();
  });
});

describe("shouldShowNoRivalBanner", () => {
  it("shows once the lookup has finished and found no rival", () => {
    expect(shouldShowNoRivalBanner(true, 0, false)).toBe(true);
  });

  it("stays hidden while rivals are loading, or after a lookup failed", () => {
    expect(shouldShowNoRivalBanner(false, 0, false)).toBe(false);
  });

  it("stays hidden when the player has a rival", () => {
    expect(shouldShowNoRivalBanner(true, 1, false)).toBe(false);
    expect(shouldShowNoRivalBanner(true, 3, false)).toBe(false);
  });

  it("stays hidden once the player has closed it", () => {
    expect(shouldShowNoRivalBanner(true, 0, true)).toBe(false);
  });
});

describe("RIVAL_SEARCH_INTERVAL_MS", () => {
  it("searches every minute - often enough to notice a new player, not a request storm", () => {
    expect(RIVAL_SEARCH_INTERVAL_MS).toBe(60_000);
  });
});
