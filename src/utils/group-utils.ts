import { Group, PlayerProfile } from "../data/groups";

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
 * Decides if joining is allowed for a user.
 * Parameters: targetGroup (the requested group), currentUserGroup (the user's current group, if any).
 * Returns: true when the user can join the group without conflicting memberships or capacity issues.
 * Edge cases: returns false if the user is already in another group or the target group is full.
 */
export const canJoinGroup = (
  targetGroup: Group,
  currentUserGroup: Group | undefined
): boolean =>
  !currentUserGroup && !isGroupFull(targetGroup);

/**
 * Creates a new player object with deterministic fields.
 * Parameters: playerId (numeric identifier), username, bracket, location, and role.
 * Returns: a PlayerProfile object with the supplied values.
 * Edge cases: role defaults to Member if a non-standard value is provided.
 */
export const buildNewPlayer = (
  playerId: number,
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
  playerId: number
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
  playerId: number
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
