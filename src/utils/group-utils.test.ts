import { describe, expect, it } from "@jest/globals";
import { Group } from "../data/groups";
import {
  buildNewPlayer,
  canJoinGroup,
  countPostingsBy,
  findGroupByUsername,
  findGroupOnDay,
  findGroupsForPlayer,
  formatBrackets,
  generateJoinCode,
  groupDayKey,
  groupErrorMessage,
  isGroupFull,
  isGroupInArea,
  MAX_POSTINGS,
  sortGroupsBySchedule,
  isHostForUser,
  normalizePositiveInt,
  removePlayerFromGroup,
  setPlayerAsHost,
} from "./group-utils";

const makeGroup = (overrides: Partial<Group> = {}): Group => ({
  id: '1',
  name: "Test Group",
  joinCode: "TST001",
  createdBy: '1',
  createdAt: 0,
  roundsPlayed: 0,
  gameType: "mtg",
  format: "Commander",
  brackets: [2],
  location: "Downtown",
  time: "Tonight",
  noGo: [],
  confirmed: false,
  source: 'player',
  players: [
    {
      id: '1',
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
    const groupA = makeGroup({ id: '1', players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] });
    const groupB = makeGroup({ id: '2', players: [buildNewPlayer('2', "Bob", 3, "Riverside", "Member")] });

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
    expect(isGroupFull(makeGroup({ players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host"), buildNewPlayer('2', "Bob", 2, "Downtown", "Member")], targetPlayers: 2 }))).toBe(true);
    expect(isGroupFull(makeGroup({ targetPlayers: 4, players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] }))).toBe(false);
  });

  it("allows joining only when the user is not already in a group and the target is not full", () => {
    const group = makeGroup({ targetPlayers: 3, players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] });
    expect(canJoinGroup(group, undefined)).toBe(true);
    expect(canJoinGroup(group, group)).toBe(false);
    expect(canJoinGroup(makeGroup({ targetPlayers: 1, players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] }), undefined)).toBe(false);
  });

  it("builds a player profile with provided values", () => {
    expect(buildNewPlayer('9', "Charlie", 4, "Central", "Member")).toEqual({
      id: '9',
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
    const group = makeGroup({ players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] });
    const result = removePlayerFromGroup(group, '1');

    expect(result.removed).toBe(true);
    expect(result.updatedGroup).toBeNull();
  });

  it("promotes the next player to host when the host leaves", () => {
    const group = makeGroup({
      players: [
        buildNewPlayer('1', "Alice", 2, "Downtown", "Host"),
        buildNewPlayer('2', "Bob", 3, "Riverside", "Member"),
      ],
    });
    const result = removePlayerFromGroup(group, '1');

    expect(result.wasHost).toBe(true);
    expect(result.updatedGroup).toEqual(
      expect.objectContaining({
        players: [
          expect.objectContaining({ id: '2', username: "Bob", role: "Host" }),
        ],
      })
    );
  });

  it("returns the same group when trying to set a non-existent host", () => {
    const group = makeGroup();
    expect(setPlayerAsHost(group, '999')).toBe(group);
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
        buildNewPlayer('1', "Alice", 2, "Downtown", "Host"),
        buildNewPlayer('2', "Bob", 3, "Riverside", "Member"),
      ],
    });

    expect(setPlayerAsHost(group, '2')).toEqual(
      expect.objectContaining({
        players: [
          expect.objectContaining({ id: '1', role: "Member" }),
          expect.objectContaining({ id: '2', role: "Host" }),
        ],
      })
    );
  });

  // ── normalizePositiveInt edge cases ─────────────────────────────────────

  it("treats zero as invalid and returns the fallback", () => {
    expect(normalizePositiveInt("0", 1)).toBe(1);
    expect(normalizePositiveInt(0, 5)).toBe(5);
  });

  it("treats negative numbers as invalid and returns the fallback", () => {
    expect(normalizePositiveInt("-3", 7)).toBe(7);
    expect(normalizePositiveInt(-1, 2)).toBe(2);
  });

  it("treats Infinity as invalid because it is not finite", () => {
    expect(normalizePositiveInt(Infinity, 4)).toBe(4);
  });

  it("accepts a positive float without rounding it", () => {
    expect(normalizePositiveInt("5.7", 1)).toBe(5.7);
  });

  it("treats an empty string as invalid and returns the fallback", () => {
    expect(normalizePositiveInt("", 9)).toBe(9);
  });

  // ── isGroupFull edge cases ───────────────────────────────────────────────

  it("treats a group as full when player count exactly equals the target", () => {
    const g = makeGroup({
      players: [
        buildNewPlayer('1', "Alice", 2, "Downtown", "Host"),
        buildNewPlayer('2', "Bob", 2, "Downtown", "Member"),
      ],
      targetPlayers: 2,
    });
    expect(isGroupFull(g)).toBe(true);
  });

  it("treats an empty group with a target of 0 as full", () => {
    expect(isGroupFull(makeGroup({ players: [], targetPlayers: 0 }))).toBe(true);
  });

  // ── canJoinGroup edge cases ──────────────────────────────────────────────

  it("blocks joining when the user is already in the target group", () => {
    const group = makeGroup({
      targetPlayers: 4,
      players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")],
    });
    expect(canJoinGroup(group, group)).toBe(false);
  });

  // ── one group per day: groupDayKey / findGroupOnDay / findGroupsForPlayer ──

  const SAME_DAY_MORNING = Date.parse("2026-07-15T12:00:00Z");
  // Built from local parts, so the expected day key is the same in whatever zone the tests run.
  const FRIDAY_EVENING = new Date(2026, 9, 9, 19, 0).getTime();
  const SATURDAY_AFTERNOON = new Date(2026, 9, 10, 13, 0).getTime();
  const alice = () => [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")];

  it("groupDayKey prefers the day the host picked", () => {
    expect(groupDayKey(makeGroup({ playDate: "2026-10-09", scheduledAt: SATURDAY_AFTERNOON }))).toBe("2026-10-09");
  });

  it("groupDayKey falls back to the local date of the scheduled time", () => {
    expect(groupDayKey(makeGroup({ scheduledAt: FRIDAY_EVENING }))).toBe("2026-10-09");
  });

  it("groupDayKey is undefined for a group with no day at all", () => {
    expect(groupDayKey(makeGroup())).toBeUndefined();
  });

  it("findGroupOnDay finds the group a player already has that day", () => {
    const group = makeGroup({ playDate: "2026-10-09", players: alice() });
    expect(findGroupOnDay([group], '1', "2026-10-09")).toBe(group);
  });

  it("findGroupOnDay leaves the next day free, even when both fall on the same UTC date", () => {
    // 7 PM Pacific on Friday and 1 PM Pacific on Saturday are the same date in UTC.
    const friday = makeGroup({ playDate: "2026-10-09", scheduledAt: Date.parse("2026-10-10T02:00:00Z"), players: alice() });
    expect(findGroupOnDay([friday], '1', "2026-10-10")).toBeUndefined();
  });

  it("findGroupOnDay catches two groups on one day, even when their UTC dates differ", () => {
    // 1 PM and 7 PM Pacific on Saturday are different dates in UTC.
    const afternoon = makeGroup({ playDate: "2026-10-10", scheduledAt: Date.parse("2026-10-10T20:00:00Z"), players: alice() });
    const evening = makeGroup({ id: '2', playDate: "2026-10-10", scheduledAt: Date.parse("2026-10-11T02:00:00Z") });
    expect(findGroupOnDay([afternoon], '1', groupDayKey(evening))).toBe(afternoon);
  });

  it("findGroupOnDay ignores groups the player is not in", () => {
    const group = makeGroup({ playDate: "2026-10-09", players: [buildNewPlayer('2', "Bob", 2, "Riverside", "Host")] });
    expect(findGroupOnDay([group], '1', "2026-10-09")).toBeUndefined();
  });

  it("findGroupOnDay never clashes with an undefined day or a group that has no day", () => {
    const dated = makeGroup({ playDate: "2026-10-09", players: alice() });
    const undated = makeGroup({ id: '2', players: alice() });
    expect(findGroupOnDay([dated, undated], '1', undefined)).toBeUndefined();
    expect(findGroupOnDay([undated], '1', "2026-10-09")).toBeUndefined();
    expect(findGroupOnDay([], '1', "2026-10-09")).toBeUndefined();
  });

  it("findGroupsForPlayer lists a player's groups soonest first, unscheduled last", () => {
    const later = makeGroup({ id: 'later', scheduledAt: SATURDAY_AFTERNOON, players: alice() });
    const sooner = makeGroup({ id: 'sooner', scheduledAt: FRIDAY_EVENING, players: alice() });
    const unscheduled = makeGroup({ id: 'unscheduled', players: alice() });
    const notMine = makeGroup({ id: 'not-mine', scheduledAt: 0, players: [buildNewPlayer('2', "Bob", 2, "Riverside", "Host")] });

    expect(findGroupsForPlayer([unscheduled, later, notMine, sooner], '1').map((g) => g.id)).toEqual(['sooner', 'later', 'unscheduled']);
  });

  it("findGroupsForPlayer returns nothing for a player in no group, and does not reorder its input", () => {
    const groups = [makeGroup({ id: 'b', scheduledAt: 2 }), makeGroup({ id: 'a', scheduledAt: 1 })];
    expect(findGroupsForPlayer(groups, 'nobody')).toEqual([]);
    findGroupsForPlayer(groups, '1');
    expect(groups.map((g) => g.id)).toEqual(['b', 'a']);
  });

  // ── groupErrorMessage ─────────────────────────────────────────────────────

  it("groupErrorMessage explains the one-group-per-day refusal", () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "group_players_one_per_day"' };
    expect(groupErrorMessage(err, 'Please try again.')).toBe('You already have a group that day. You can be in one group per day.');
  });

  it("groupErrorMessage explains joining a group twice", () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "group_players_pkey"' };
    expect(groupErrorMessage(err, 'Please try again.')).toBe("You're already in this group.");
  });

  it("groupErrorMessage reads the constraint from details when the message lacks it", () => {
    const err = { code: '23505', message: 'duplicate key', details: 'Key violates group_players_one_per_day' };
    expect(groupErrorMessage(err, 'Please try again.')).toBe('You already have a group that day. You can be in one group per day.');
  });

  it("groupErrorMessage passes other errors through in their own words", () => {
    expect(groupErrorMessage(new Error('Network request failed'), 'Please try again.')).toBe('Network request failed');
    expect(groupErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "groups_join_code_idx"' }, 'x'))
      .toBe('duplicate key value violates unique constraint "groups_join_code_idx"');
  });

  it("groupErrorMessage falls back when there is nothing usable to say", () => {
    expect(groupErrorMessage(undefined, 'Please try again.')).toBe('Please try again.');
    expect(groupErrorMessage(null, 'Please try again.')).toBe('Please try again.');
    expect(groupErrorMessage('boom', 'Please try again.')).toBe('Please try again.');
    expect(groupErrorMessage({ message: '   ' }, 'Please try again.')).toBe('Please try again.');
    expect(groupErrorMessage({ message: 42 }, 'Please try again.')).toBe('Please try again.');
  });

  it("canJoinGroup blocks joining when a same-day conflict is passed in", () => {
    const target = makeGroup({ targetPlayers: 4, players: [buildNewPlayer('9', "Zoe", 2, "Downtown", "Host")] });
    const conflicting = makeGroup({ id: '2', scheduledAt: SAME_DAY_MORNING, players: [buildNewPlayer('1', "Alice", 2, "Downtown", "Host")] });
    expect(canJoinGroup(target, conflicting)).toBe(false);
  });

  // ── findGroupByUsername edge cases ───────────────────────────────────────

  it("returns undefined when the groups list is empty", () => {
    expect(findGroupByUsername([], "Alice")).toBeUndefined();
  });

  it("returns undefined when searching with an empty username string", () => {
    expect(findGroupByUsername([makeGroup()], "")).toBeUndefined();
  });

  // ── removePlayerFromGroup edge cases ────────────────────────────────────

  it("returns the original group unchanged when the player id is not found", () => {
    const group = makeGroup();
    const result = removePlayerFromGroup(group, '999');
    expect(result.removed).toBe(false);
    expect(result.updatedGroup).toBe(group);
  });

  it("removes a non-host member without changing any role", () => {
    const group = makeGroup({
      players: [
        buildNewPlayer('1', "Alice", 2, "Downtown", "Host"),
        buildNewPlayer('2', "Bob", 3, "Riverside", "Member"),
      ],
    });
    const result = removePlayerFromGroup(group, '2');
    expect(result.wasHost).toBe(false);
    expect(result.removed).toBe(false);
    expect(result.updatedGroup?.players).toHaveLength(1);
    expect(result.updatedGroup?.players[0].role).toBe("Host");
  });

  // ── setPlayerAsHost edge cases ───────────────────────────────────────────

  it("returns a valid group when the current host is re-assigned as host", () => {
    const group = makeGroup();
    const result = setPlayerAsHost(group, '1');
    expect(result.players[0].role).toBe("Host");
  });

  // ── formatBrackets edge cases ────────────────────────────────────────────

  it("formats all five bracket levels sorted ascending", () => {
    expect(formatBrackets([5, 3, 1, 4, 2])).toBe("Brackets 1, 2, 3, 4, 5");
  });

  it("sorts a descending pair into ascending display order", () => {
    expect(formatBrackets([5, 4])).toBe("Brackets 4, 5");
  });

  it("formats bracket 1 as 'Bracket 1'", () => {
    expect(formatBrackets([1])).toBe("Bracket 1");
  });

  // ── generateJoinCode ─────────────────────────────────────────────────────

  it("generates a 6-character alphanumeric code from the allowed alphabet", () => {
    const code = generateJoinCode([]);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("never returns a code that already exists in the group list", () => {
    const existing = [makeGroup({ joinCode: "AAAAAA" })];
    const code = generateJoinCode(existing);
    expect(code).not.toBe("AAAAAA");
    expect(code).toHaveLength(6);
  });

  it("works correctly with an empty existing groups list", () => {
    const code = generateJoinCode([]);
    expect(typeof code).toBe("string");
    expect(code).toHaveLength(6);
  });

  // ── Find list: order, area, and the posting limit ────────────────────────

  it("sortGroupsBySchedule puts the soonest game first", () => {
    const later = makeGroup({ id: 'later', scheduledAt: 3000, createdAt: 1 });
    const soon = makeGroup({ id: 'soon', scheduledAt: 1000, createdAt: 2 });
    const middle = makeGroup({ id: 'middle', scheduledAt: 2000, createdAt: 3 });

    expect(sortGroupsBySchedule([later, soon, middle]).map((g) => g.id)).toEqual(['soon', 'middle', 'later']);
  });

  it("sortGroupsBySchedule lists games at the same time in the order they were posted", () => {
    const third = makeGroup({ id: 'third', scheduledAt: 1000, createdAt: 30 });
    const first = makeGroup({ id: 'first', scheduledAt: 1000, createdAt: 10 });
    const second = makeGroup({ id: 'second', scheduledAt: 1000, createdAt: 20 });

    expect(sortGroupsBySchedule([third, first, second]).map((g) => g.id)).toEqual(['first', 'second', 'third']);
  });

  it("sortGroupsBySchedule puts unscheduled groups last, oldest posting first", () => {
    const newerUnscheduled = makeGroup({ id: 'u2', createdAt: 2 });
    const olderUnscheduled = makeGroup({ id: 'u1', createdAt: 1 });
    const scheduled = makeGroup({ id: 's', scheduledAt: 9999999999999, createdAt: 99 });

    expect(sortGroupsBySchedule([newerUnscheduled, scheduled, olderUnscheduled]).map((g) => g.id)).toEqual(['s', 'u1', 'u2']);
  });

  it("sortGroupsBySchedule returns a new list and leaves its input alone", () => {
    const input = [makeGroup({ id: 'b', scheduledAt: 2 }), makeGroup({ id: 'a', scheduledAt: 1 })];
    const sorted = sortGroupsBySchedule(input);

    expect(sorted).not.toBe(input);
    expect(input.map((g) => g.id)).toEqual(['b', 'a']);
    expect(sortGroupsBySchedule([])).toEqual([]);
  });

  it("isGroupInArea lists a posting from the player's own area and hides one from elsewhere", () => {
    expect(isGroupInArea(makeGroup({ area: 'reno-sparks' }), 'reno-sparks')).toBe(true);
    expect(isGroupInArea(makeGroup({ area: 'sacramento-california-us' }), 'reno-sparks')).toBe(false);
  });

  it("isGroupInArea lists everything when the player's area isn't known or the filter is off", () => {
    expect(isGroupInArea(makeGroup({ area: 'sacramento-california-us' }), undefined)).toBe(true);
    expect(isGroupInArea(makeGroup(), undefined)).toBe(true);
  });

  it("isGroupInArea lists a posting with no recorded area everywhere", () => {
    expect(isGroupInArea(makeGroup(), 'reno-sparks')).toBe(true);
  });

  it("countPostingsBy counts the groups a player is hosting now, not the ones they first posted", () => {
    const handedOff = makeGroup({ id: 'a', createdBy: '1', players: [
      buildNewPlayer('1', "Alice", 2, "Downtown", "Member"),
      buildNewPlayer('2', "Bob", 2, "Riverside", "Host"),
    ] });
    const mine = makeGroup({ id: 'b', createdBy: '1' });
    const takenOver = makeGroup({ id: 'c', createdBy: '2', players: [
      buildNewPlayer('2', "Bob", 2, "Riverside", "Member"),
      buildNewPlayer('1', "Alice", 2, "Downtown", "Host"),
    ] });
    const justPlaying = makeGroup({ id: 'd', createdBy: '2', players: [
      buildNewPlayer('2', "Bob", 2, "Riverside", "Host"),
      buildNewPlayer('1', "Alice", 2, "Downtown", "Member"),
    ] });
    const all = [handedOff, mine, takenOver, justPlaying];

    // Alice hosts the one she kept and the one she took over; the one she handed on is Bob's now.
    expect(countPostingsBy(all, '1')).toBe(2);
    expect(countPostingsBy(all, '2')).toBe(2);
    expect(countPostingsBy(all, 'nobody')).toBe(0);
    expect(countPostingsBy([], '1')).toBe(0);
  });

  it("handing a posting to another host frees a slot", () => {
    const hosted = Array.from({ length: MAX_POSTINGS }, (_, i) => makeGroup({ id: `g${i}` }));
    expect(countPostingsBy(hosted, '1')).toBe(MAX_POSTINGS);

    const afterHandoff = [
      makeGroup({ id: 'g0', players: [
        buildNewPlayer('1', "Alice", 2, "Downtown", "Member"),
        buildNewPlayer('2', "Bob", 2, "Riverside", "Host"),
      ] }),
      ...hosted.slice(1),
    ];
    expect(countPostingsBy(afterHandoff, '1')).toBe(MAX_POSTINGS - 1);
  });

  it("the posting limit is 7", () => {
    expect(MAX_POSTINGS).toBe(7);
  });
});
