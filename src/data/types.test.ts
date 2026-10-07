import { describe, expect, it } from "@jest/globals";
import {
  COMMANDER_FORMAT,
  COMMANDER_GAME,
  COMMANDER_ONLY,
  FORMAT_OPTIONS,
  GAME_LABELS,
  isGroupInScope,
  SELECTABLE_GAMES,
  selectableFormats,
  visibleGames,
} from "./types";

// These pin down Commander-only mode. If COMMANDER_ONLY is ever turned off, this whole block is
// expected to fail and should be rewritten for the full game list rather than patched.
describe("Commander-only mode", () => {
  it("is on, and points at Magic Commander", () => {
    expect(COMMANDER_ONLY).toBe(true);
    expect(COMMANDER_GAME).toBe("mtg");
    expect(COMMANDER_FORMAT).toBe("Commander");
  });

  it("offers Magic as the only game to pick", () => {
    expect(SELECTABLE_GAMES).toEqual(["mtg"]);
  });

  it("offers Commander as Magic's only format and nothing for other games", () => {
    expect(selectableFormats("mtg")).toEqual(["Commander"]);
    expect(selectableFormats("pokemon")).toEqual([]);
    expect(selectableFormats("lorcana")).toEqual([]);
    expect(selectableFormats("onepiece")).toEqual([]);
  });

  it("treats every player as a Magic player, whatever their profile lists", () => {
    expect(visibleGames(["pokemon", "lorcana"])).toEqual(["mtg"]);
    expect(visibleGames(["mtg", "onepiece"])).toEqual(["mtg"]);
    expect(visibleGames([])).toEqual(["mtg"]);
  });

  it("lists only Magic Commander groups", () => {
    expect(isGroupInScope("mtg", "Commander")).toBe(true);
    expect(isGroupInScope("mtg", "  commander ")).toBe(true);
    expect(isGroupInScope("mtg", "Standard")).toBe(false);
    expect(isGroupInScope("mtg", "Draft")).toBe(false);
    expect(isGroupInScope("mtg", "")).toBe(false);
    expect(isGroupInScope("pokemon", "Commander")).toBe(false);
    expect(isGroupInScope("lorcana", "Constructed")).toBe(false);
  });

  it("deletes nothing: the other games and formats are still defined", () => {
    expect(Object.keys(GAME_LABELS).sort()).toEqual(["lorcana", "mtg", "onepiece", "pokemon"]);
    expect(FORMAT_OPTIONS.mtg).toEqual(["Commander", "Standard", "Draft", "Modern", "Pioneer"]);
    expect(FORMAT_OPTIONS.pokemon.length).toBeGreaterThan(0);
  });
});
