import { describe, expect, it } from "@jest/globals";
import { rankByScore, rankLabel } from "./leaderboard-utils";

const row = (name: string, monthlyPoints: number) => ({ name, monthlyPoints });
const summary = (rows: { name: string; rank: number; tied: boolean }[]) =>
  rows.map((r) => `${r.name}:${r.rank}${r.tied ? "T" : ""}`).join(" ");

describe("rankByScore", () => {
  it("orders by Score, highest first, numbering from 1", () => {
    expect(summary(rankByScore([row("c", 10), row("a", 90), row("b", 40)]))).toBe("a:1 b:2 c:3");
  });

  it("gives players level on Score the same place, and marks them tied", () => {
    expect(summary(rankByScore([row("a", 90), row("b", 40), row("c", 40), row("d", 10)]))).toBe("a:1 b:2T c:2T d:4");
  });

  it("skips the places a tie used up", () => {
    const ranked = rankByScore([row("a", 50), row("b", 50), row("c", 50), row("d", 20)]);
    expect(summary(ranked)).toBe("a:1T b:1T c:1T d:4");
  });

  it("ranks everyone first and tied when nobody has scored yet", () => {
    expect(summary(rankByScore([row("a", 0), row("b", 0)]))).toBe("a:1T b:1T");
  });

  it("keeps tied rows in the order they came in", () => {
    expect(rankByScore([row("me", 40), row("x", 40), row("y", 40)]).map((r) => r.name)).toEqual(["me", "x", "y"]);
  });

  it("handles one row, and none", () => {
    expect(summary(rankByScore([row("a", 5)]))).toBe("a:1");
    expect(rankByScore([])).toEqual([]);
  });

  it("keeps each row's other fields and leaves the input alone", () => {
    const input = [row("b", 1), row("a", 2)];
    const ranked = rankByScore(input);
    expect(ranked[0]).toEqual({ name: "a", monthlyPoints: 2, rank: 1, tied: false });
    expect(input.map((r) => r.name)).toEqual(["b", "a"]);
  });
});

describe("rankLabel", () => {
  it("shows a medal for the top three and a number below", () => {
    expect([1, 2, 3, 4, 11].map(rankLabel)).toEqual(["🥇", "🥈", "🥉", "#4", "#11"]);
  });
});
