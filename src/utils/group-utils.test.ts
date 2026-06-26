import { describe, expect, it } from "@jest/globals";
import { Group } from "../data/groups";
import {
  buildNewPlayer,
  canJoinGroup,
  findGroupByUsername,
  formatBrackets,
  isGroupFull,
  isHostForUser,
  normalizePositiveInt,
  removePlayerFromGroup,
  setPlayerAsHost,
} from "./group-utils";

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: 1,
  name: "Test Group",
  joinCode: "TST001",
  createdAt: 0,
  gameType: "mtg",
  format: "Commander",
  brackets: [2],
  location: "Downtown",
  time: "Tonight",
  noGo: [],
  confirmed: false,
  players: [
    {
      id: 1,
      username: "Alice",
      bracket: 2,
      location: "Downtown",
      role: "Host",
    },
  ],
  targetPlayers: 3,
  ...overrides,
});

describe("group-utils", () => {
  it("finds the correct group when the username exists", () => {
    const groupA = makeGroup({ id: 1, players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host")] });
    const groupB = makeGroup({ id: 2, players: [buildNewPlayer(2, "Bob", 3, "Riverside", "Member")] });

    expect(findGroupByUsername([groupA, groupB], "Bob")).toBe(groupB);
  });

  it("returns undefined when the username is not present", () => {
    expect(findGroupByUsername([makeGroup()], "Missing")).toBeUndefined();
  });

  it("detects a host correctly", () => {
    const group = makeGroup();
    expect(isHostForUser(group, "Alice")).toBe(true);
    expect(isHostForUser(group, "Bob")).toBe(false);
  });

  it("returns false for missing groups and usernames", () => {
    expect(isHostForUser(undefined, "Alice")).toBe(false);
  });

  it("detects when a group is full", () => {
    expect(isGroupFull(makeGroup({ players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host"), buildNewPlayer(2, "Bob", 2, "Downtown", "Member")], targetPlayers: 2 }))).toBe(true);
    expect(isGroupFull(makeGroup({ targetPlayers: 4, players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host")] }))).toBe(false);
  });

  it("allows joining only when the user is not already in a group and the target is not full", () => {
    const group = makeGroup({ targetPlayers: 3, players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host")] });
    expect(canJoinGroup(group, undefined)).toBe(true);
    expect(canJoinGroup(group, group)).toBe(false);
    expect(canJoinGroup(makeGroup({ targetPlayers: 1, players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host")] }), undefined)).toBe(false);
  });

  it("builds a player profile with provided values", () => {
    expect(buildNewPlayer(9, "Charlie", 4, "Central", "Member")).toEqual({
      id: 9,
      username: "Charlie",
      bracket: 4,
      location: "Central",
      role: "Member",
    });
  });

  it("normalizes invalid values to a fallback", () => {
    expect(normalizePositiveInt("5", 1)).toBe(5);
    expect(normalizePositiveInt("0", 1)).toBe(1);
    expect(normalizePositiveInt("abc", 3)).toBe(3);
    expect(normalizePositiveInt(undefined, 4)).toBe(4);
  });

  it("removes a player and removes the group when it becomes empty", () => {
    const group = makeGroup({ players: [buildNewPlayer(1, "Alice", 2, "Downtown", "Host")] });
    const result = removePlayerFromGroup(group, 1);

    expect(result.removed).toBe(true);
    expect(result.updatedGroup).toBeNull();
  });

  it("promotes the next player to host when the host leaves", () => {
    const group = makeGroup({
      players: [
        buildNewPlayer(1, "Alice", 2, "Downtown", "Host"),
        buildNewPlayer(2, "Bob", 3, "Riverside", "Member"),
      ],
    });
    const result = removePlayerFromGroup(group, 1);

    expect(result.wasHost).toBe(true);
    expect(result.updatedGroup).toEqual(
      expect.objectContaining({
        players: [
          expect.objectContaining({ id: 2, username: "Bob", role: "Host" }),
        ],
      })
    );
  });

  it("returns the same group when trying to set a non-existent host", () => {
    const group = makeGroup();
    expect(setPlayerAsHost(group, 999)).toBe(group);
  });

  it("formats a single bracket as 'Bracket N'", () => {
    expect(formatBrackets([2])).toBe('Bracket 2');
  });

  it("formats multiple brackets sorted ascending as 'Brackets N, M, ...'", () => {
    expect(formatBrackets([3, 1, 2])).toBe('Brackets 1, 2, 3');
  });

  it("returns an empty string for an empty brackets array", () => {
    expect(formatBrackets([])).toBe('');
  });

  it("changes the host to the requested player", () => {
    const group = makeGroup({
      players: [
        buildNewPlayer(1, "Alice", 2, "Downtown", "Host"),
        buildNewPlayer(2, "Bob", 3, "Riverside", "Member"),
      ],
    });

    expect(setPlayerAsHost(group, 2)).toEqual(
      expect.objectContaining({
        players: [
          expect.objectContaining({ id: 1, role: "Member" }),
          expect.objectContaining({ id: 2, role: "Host" }),
        ],
      })
    );
  });
});
