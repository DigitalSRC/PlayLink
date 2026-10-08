import { Group, PlayerProfile } from "../data/groups";
import { dateKeyFromMs } from "./calendar-utils";

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generates a unique 6-character join code for a new group using Overwatch-style alphanumeric codes.
 * Omits visually ambiguous characters (I, L, O, 0, 1) to minimize read errors.
 * Parameters: existingGroups (all current groups used to avoid collisions).
 * Returns: a 6-character uppercase code guaranteed not to match any existing group's joinCode.
 * Edge cases: retries on collision until a unique code is found; statistically rare with 31^6 > 887M combinations.
 */
export const generateJoinCode = (existingGroups: Group[]): string => {
  const used = new Set(existingGroups.map((g) => g.joinCode));
  let code: string;
  let attempts = 0;
  do {
    code = Array.from({ length: 6 }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join('');
    attempts++;
  } while (used.has(code) && attempts < 1000);
  return code;
};

/**
 * Finds the group that currently contains a username.
 * Parameters: groups (all available groups), username (player name to search for).
 * Returns: the matching group or undefined when the username is not in any group.
 * Edge cases: returns undefined for unknown usernames or when the list is empty.
 */
export const findGroupByUsername = (
  groups: Group[],
  username: string
): Group | undefined =>
  groups.find((group) =>
    group.players.some((player) => player.username === username)
  );

/**
 * Determines whether a player is the host for a group.
 * Parameters: group (the group to inspect), username (the player name to check).
 * Returns: true when the username exists and has the Host role, otherwise false.
 * Edge cases: returns false for missing groups or users without a matching role.
 */
export const isHostForUser = (
  group: Group | undefined,
  username: string
): boolean =>
  group?.players.some(
    (player) => player.username === username && player.role === "Host"
  ) ?? false;

/**
 * Checks whether a group still has room for another member.
 * Parameters: group (the group to evaluate).
 * Returns: true when the current player count has reached the target size.
 * Edge cases: treats groups with missing or invalid target counts as not full when the count is below zero.
 */
export const isGroupFull = (group: Group): boolean =>
  group.players.length >= group.targetPlayers;

/**
 * Works out which calendar day a group is played on, as a "YYYY-MM-DD" key.
 * A player may be in one group per day, so this is the value two groups are compared by.
 * It prefers the day the host picked (playDate) and falls back to the local date of the
 * scheduled time for groups posted before that was recorded.
 * Parameters: group (the group to read).
 * Returns: the day key, or undefined when the group has no day at all.
 * Edge cases: the fallback uses this device's time zone, so for an older group it can differ by
 * a day from what the host saw; a group with neither value returns undefined and never counts
 * as clashing with anything.
 */
export const groupDayKey = (group: Group): string | undefined =>
  group.playDate ?? (group.scheduledAt !== undefined ? dateKeyFromMs(group.scheduledAt) : undefined);

/**
 * Finds the group a player already has on a given day, if any.
 * This is the check behind "one group per day": before creating or joining, look for a group
 * the player is in that falls on the same day.
 * Parameters: groups (every known group), playerId (the player to look for), dayKey (the
 * "YYYY-MM-DD" day being considered, or undefined).
 * Returns: the clashing group, or undefined when the day is free.
 * Edge cases: returns undefined for an undefined dayKey, an unknown player, or an empty list;
 * if the list hasn't loaded yet it finds nothing, so the database's own rule is the backstop.
 */
export const findGroupOnDay = (
  groups: Group[],
  playerId: string,
  dayKey: string | undefined
): Group | undefined =>
  dayKey === undefined
    ? undefined
    : groups.find(
        (group) =>
          groupDayKey(group) === dayKey &&
          group.players.some((player) => player.id === playerId)
      );

/**
 * Lists every group a player is in, soonest first.
 * Now that a player can hold a group on each day, screens that used to show "your group" show
 * this list instead.
 * Parameters: groups (every known group), playerId (the player to look for).
 * Returns: the player's groups ordered by scheduled time, earliest first.
 * Edge cases: groups with no scheduled time sort to the end, in their original order; returns an
 * empty array for an unknown player.
 */
export const findGroupsForPlayer = (groups: Group[], playerId: string): Group[] =>
  sortGroupsBySchedule(
    groups.filter((group) => group.players.some((player) => player.id === playerId))
  );

/**
 * Puts groups in the order a player wants to read them: the soonest game first.
 * When two groups start at the same moment, the one that was posted first comes first, so a
 * newer posting can't jump ahead of one that has been waiting.
 * Parameters: groups (any list of groups).
 * Returns: a new array in that order; the input is not changed.
 * Edge cases: groups with no scheduled time go to the end, oldest posting first among
 * themselves; an empty list returns an empty list.
 */
export const sortGroupsBySchedule = (groups: Group[]): Group[] =>
  [...groups].sort(
    (a, b) =>
      (a.scheduledAt ?? Number.MAX_SAFE_INTEGER) - (b.scheduledAt ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt - b.createdAt
  );

/**
 * Decides whether a posting belongs in a player's Find list, which shows their own area only.
 * Parameters: group (the posting), areaId (the player's event area, or undefined when it isn't
 * known or the player has asked to see every area).
 * Returns: true when the posting should be listed.
 * Edge cases: with no areaId everything is listed; a posting with no recorded area (made before
 * areas were saved) is listed everywhere rather than hidden from everyone.
 */
export const isGroupInArea = (group: Group, areaId: string | undefined): boolean =>
  areaId === undefined || group.area === undefined || group.area === areaId;

/** The most postings one player can have up at once. The server enforces the same number
 * (groups_enforce_posting_limit in 20261008140000); change both together. */
export const MAX_POSTINGS = 7;

/**
 * Counts how many postings a player currently has up, for the posting limit.
 * A posting counts against whoever created it for as long as the group exists, even if they
 * have since handed the host role to someone else - the same way the server counts.
 * Parameters: groups (every known group), playerId (the player to count for).
 * Returns: the number of groups that player created.
 * Edge cases: returns 0 for an unknown player or an empty list; if the list hasn't loaded yet
 * it undercounts, and the server's own limit is then what refuses the eighth.
 */
export const countPostingsBy = (groups: Group[], playerId: string): number =>
  groups.filter((group) => group.createdBy === playerId).length;

/**
 * Turns an error from creating or joining a group into a sentence a player can act on.
 * The database refuses a second group on the same day and a second seat in the same group with
 * the same error code, and its own wording ("duplicate key value violates unique constraint")
 * means nothing to a player.
 * Parameters: err (whatever was thrown), fallback (what to say when the error has no message).
 * Returns: a plain-English explanation.
 * Edge cases: anything that isn't a recognised database refusal returns its own message, or the
 * fallback when it has none; never throws, whatever is passed in.
 */
export const groupErrorMessage = (err: unknown, fallback: string): string => {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const text = `${typeof e.message === 'string' ? e.message : ''} ${typeof e.details === 'string' ? e.details : ''}`;
  if (e.code === '23505') {
    if (text.includes('group_players_pkey')) return "You're already in this group.";
    if (text.includes('group_players_one')) {
      return 'You already have a group that day. You can be in one group per day.';
    }
  }
  return typeof e.message === 'string' && e.message.trim() !== '' ? e.message : fallback;
};

/**
 * Decides if joining is allowed for a user.
 * Parameters: targetGroup (the requested group), currentUserGroup (the group the user already has on the same day, if any - see findGroupOnDay).
 * Returns: true when the user can join the group without conflicting memberships or capacity issues.
 * Edge cases: returns false if the user already has a group that day or the target group is full.
 */
export const canJoinGroup = (
  targetGroup: Group,
  currentUserGroup: Group | undefined
): boolean =>
  !currentUserGroup && !isGroupFull(targetGroup);

/**
 * Creates a new player object with deterministic fields.
 * Parameters: playerId (the joining user's Supabase auth id), username, bracket, location, and role.
 * Returns: a PlayerProfile object with the supplied values.
 * Edge cases: role defaults to Member if a non-standard value is provided.
 */
export const buildNewPlayer = (
  playerId: string,
  username: string,
  bracket: number,
  location: string,
  role: PlayerProfile["role"] = "Member"
): PlayerProfile => ({
  id: playerId,
  username,
  bracket,
  location,
  role,
});

/**
 * Normalizes a numeric input so bad values fallback safely.
 * Parameters: value (string, number, or undefined), fallback (the default value).
 * Returns: a positive number from the input or the fallback when parsing fails.
 * Edge cases: returns the fallback for NaN, negative numbers, empty strings, and non-numeric values.
 */
export const normalizePositiveInt = (
  value: string | number | undefined,
  fallback: number
): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
};

/**
 * Removes a player from a group and promotes the next player to host if needed.
 * Parameters: group (group to update), playerId (id of player leaving).
 * Returns: an object containing the updated group, a boolean indicating whether the group was removed, and whether the leaving player was the host.
 * Edge cases: returns the original group unchanged when the player is not found, and removes the group entirely when the last player leaves.
 */
export const removePlayerFromGroup = (
  group: Group,
  playerId: string
): {
  updatedGroup: Group | null;
  wasHost: boolean;
  removed: boolean;
} => {
  const playerExists = group.players.some((player) => player.id === playerId);

  if (!playerExists) {
    return {
      updatedGroup: group,
      wasHost: false,
      removed: false,
    };
  }

  const updatedPlayers = group.players.filter(
    (player) => player.id !== playerId
  );
  const wasHost = group.players.some(
    (player) => player.id === playerId && player.role === "Host"
  );

  if (updatedPlayers.length === 0) {
    return {
      updatedGroup: null,
      wasHost,
      removed: true,
    };
  }

  const nextPlayers =
    wasHost && updatedPlayers[0]
      ? updatedPlayers.map((player, index) =>
          index === 0 ? { ...player, role: "Host" } : player
        )
      : updatedPlayers;

  return {
    updatedGroup: {
      ...group,
      players: nextPlayers,
    },
    wasHost,
    removed: false,
  };
};

/**
 * Formats a brackets array into a readable label for display in group cards and detail views.
 * Returns "Bracket N" when only one bracket is present, or "Brackets N, M, ..." sorted ascending for multiple.
 * Handles the Commander multi-bracket case without requiring callers to know the array length.
 * Parameters: brackets (array of bracket numbers on a group).
 * Returns: a display string such as "Bracket 2" or "Brackets 1, 2, 3".
 * Edge cases: returns an empty string when given an empty array; callers should ensure at least one bracket is set.
 */
export const formatBrackets = (brackets: number[]): string => {
  if (brackets.length === 0) return '';
  const sorted = [...brackets].sort((a, b) => a - b);
  return sorted.length === 1
    ? `Bracket ${sorted[0]}`
    : `Brackets ${sorted.join(', ')}`;
};

/**
 * Updates a group so another player becomes the host.
 * Parameters: group (the group to edit), playerId (the player who should become host).
 * Returns: a new group object with the requested player marked as host.
 * Edge cases: leaves the group untouched when the requested player is not found.
 */
export const setPlayerAsHost = (
  group: Group,
  playerId: string
): Group => {
  const playerExists = group.players.some((player) => player.id === playerId);

  if (!playerExists) {
    return group;
  }

  return {
    ...group,
    players: group.players.map((player) => ({
      ...player,
      role:
        player.id === playerId
          ? "Host"
          : player.role === "Host"
            ? "Member"
            : player.role,
    })),
  };
};
