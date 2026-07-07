import { describe, expect, it } from "@jest/globals";
import { computePlacementScores, PARTICIPATION_POINTS } from "./scoring-utils";

describe("computePlacementScores", () => {
  it("returns an empty array for no placements", () => {
    expect(computePlacementScores([])).toEqual([]);
  });

  it("awards a 2-player winner the full base pool plus participation, loser just participation", () => {
    const results = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 2 },
    ]);
    const a = results.find((r) => r.playerId === "a")!;
    const b = results.find((r) => r.playerId === "b")!;

    expect(a.outcome).toBe("win");
    expect(a.pointsAwarded).toBe(10 + PARTICIPATION_POINTS); // 10 * (2 - 1) = 10 base
    expect(b.outcome).toBe("loss");
    expect(b.pointsAwarded).toBe(0 + PARTICIPATION_POINTS);
  });

  it("treats a 2-player tie as a draw with no placement points for either", () => {
    const results = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 1 },
    ]);
    results.forEach((r) => {
      expect(r.outcome).toBe("draw");
      expect(r.pointsAwarded).toBe(PARTICIPATION_POINTS);
    });
  });

  it("cascades points by half for each subsequent rank in a 4-player pod, zeroing last place", () => {
    const results = computePlacementScores([
      { playerId: "first", placement: 1 },
      { playerId: "second", placement: 2 },
      { playerId: "third", placement: 3 },
      { playerId: "fourth", placement: 4 },
    ]);
    const byId = Object.fromEntries(results.map((r) => [r.playerId, r]));

    // winnerBasePoints = 10 * (4 - 1) = 30
    expect(byId.first.pointsAwarded).toBe(30 + PARTICIPATION_POINTS);
    expect(byId.first.outcome).toBe("win");
    expect(byId.second.pointsAwarded).toBe(15 + PARTICIPATION_POINTS); // half of 30
    expect(byId.second.outcome).toBe("draw");
    expect(byId.third.pointsAwarded).toBe(8 + PARTICIPATION_POINTS); // round(30/4) = 8, not last so not zeroed
    expect(byId.third.outcome).toBe("draw");
    // Last place always scores zero placement points, overriding the halving formula
    // (which would otherwise give round(30/8) = 4).
    expect(byId.fourth.pointsAwarded).toBe(PARTICIPATION_POINTS);
    expect(byId.fourth.outcome).toBe("loss");
  });

  it("scores a tied last-place pair identically as a draw, both zeroed on placement points", () => {
    const results = computePlacementScores([
      { playerId: "winner", placement: 1 },
      { playerId: "tiedA", placement: 2 },
      { playerId: "tiedB", placement: 2 },
    ]);
    const byId = Object.fromEntries(results.map((r) => [r.playerId, r]));

    // winnerBasePoints = 10 * (3 - 1) = 20
    expect(byId.winner.pointsAwarded).toBe(20 + PARTICIPATION_POINTS);
    expect(byId.winner.outcome).toBe("win");
    expect(byId.tiedA.pointsAwarded).toBe(PARTICIPATION_POINTS);
    expect(byId.tiedB.pointsAwarded).toBe(PARTICIPATION_POINTS);
    expect(byId.tiedA.outcome).toBe("draw");
    expect(byId.tiedB.outcome).toBe("draw");
  });

  it("gives every participant the participation bonus regardless of placement", () => {
    const results = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 2 },
      { playerId: "c", placement: 3 },
    ]);
    results.forEach((r) => expect(r.pointsAwarded).toBeGreaterThanOrEqual(PARTICIPATION_POINTS));
  });

  it("preserves input order in the output", () => {
    const results = computePlacementScores([
      { playerId: "z", placement: 3 },
      { playerId: "y", placement: 1 },
      { playerId: "x", placement: 2 },
    ]);
    expect(results.map((r) => r.playerId)).toEqual(["z", "y", "x"]);
  });

  // group-detail.tsx's drag-and-drop report modal (see docs/version-control-workflow.md's
  // game-scoring entry) assigns each row a placement equal to its 1-indexed position, only
  // reusing the previous row's value for a "tied with above" pair — so a tied pair followed by
  // more players produces a gap (e.g. 1, 1, 3, 4), never a compacted 1, 1, 2, 3. These two cases
  // must score identically, since only the relative order of distinct placement values matters
  // here, not their absolute spacing.
  it("scores a gapped placement sequence (from a tied pair followed by solo ranks) the same as the equivalent compact sequence", () => {
    const gapped = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 1 },
      { playerId: "c", placement: 3 },
      { playerId: "d", placement: 4 },
    ]);
    const compact = computePlacementScores([
      { playerId: "a", placement: 1 },
      { playerId: "b", placement: 1 },
      { playerId: "c", placement: 2 },
      { playerId: "d", placement: 3 },
    ]);

    const strip = (results: typeof gapped) =>
      results.map(({ playerId, outcome, pointsAwarded }) => ({ playerId, outcome, pointsAwarded }));
    expect(strip(gapped)).toEqual(strip(compact));

    const byId = Object.fromEntries(gapped.map((r) => [r.playerId, r]));
    expect(byId.a.outcome).toBe("draw");
    expect(byId.b.outcome).toBe("draw");
    expect(byId.c.outcome).toBe("draw");
    expect(byId.d.outcome).toBe("loss");
  });
});
