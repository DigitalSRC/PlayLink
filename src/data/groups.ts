import {
  GROUP_NAME_POOL,
  LOCATION_POOL,
  PLAYER_NAME_POOL,
  TIME_POOL,
} from "./random-data";

export interface PlayerProfile {
  id: number;
  username: string;
  bracket: number;
  location: string;
  role: string;
}

export interface Group {
  id: number;
  name: string;
  players: PlayerProfile[];
  targetPlayers: number;
  bracket: number;
  location: string;
  time: string;
}

/**
 * Returns a shuffled copy of the provided array.
 * This helps randomize seeded data without mutating the original collection.
 * Parameters: items (the array to shuffle).
 * Returns: a new array containing the same elements in a randomized order.
 * Edge cases: if items is empty, the function simply returns an empty array.
 */
const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

/**
 * Picks one random item from an array.
 * This is used to select names, locations, and times from the predefined pools.
 * Parameters: items (the source array to choose from).
 * Returns: one randomly selected item from the array.
 * Edge cases: if the array is empty, the function will attempt to read an undefined value.
 */
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * Builds a single random player profile for a group.
 * The function chooses a username, bracket, and location, then combines them with an ID and role.
 * Parameters: id (player identifier), role (the player's role in the group).
 * Returns: a PlayerProfile object with randomized display data.
 * Edge cases: the function assumes the random pools are non-empty; empty pools would produce undefined values.
 */
const createRandomPlayer = (id: number, role: string): PlayerProfile => {
  const username = pick(PLAYER_NAME_POOL);
  return {
    id,
    username,
    bracket: Math.floor(Math.random() * 6) + 1,
    location: pick(LOCATION_POOL),
    role,
  };
};

/**
 * Builds a complete random group object for the app.
 * The function creates a small roster, chooses a name and time, and calculates a valid target player count.
 * Parameters: id (group identifier).
 * Returns: a Group object with players, schedule details, and capacity metadata.
 * Edge cases: if the random pools are empty or the roster logic produces an invalid count, the output may not represent a realistic group.
 */
const createRandomGroup = (id: number): Group => {
  const groupPlayers = shuffle(PLAYER_NAME_POOL).slice(0, Math.floor(Math.random() * 3) + 2);
  const memberCount = Math.min(groupPlayers.length, Math.floor(Math.random() * 3) + 2);
  const players: PlayerProfile[] = [];

  for (let index = 0; index < memberCount; index += 1) {
    players.push(
      createRandomPlayer(
        id * 100 + index + 1,
        index === 0 ? "Host" : "Member"
      )
    );
  }

  const targetPlayers = Math.max(memberCount + 1, Math.floor(Math.random() * 3) + memberCount);

  return {
    id,
    name: pick(GROUP_NAME_POOL),
    players,
    targetPlayers,
    bracket: Math.floor(Math.random() * 6) + 1,
    location: pick(LOCATION_POOL),
    time: pick(TIME_POOL),
  };
};

export const HARDCODED_GROUPS: Group[] = Array.from(
  { length: Math.floor(Math.random() * 5) + 1 },
  (_, index) => createRandomGroup(index + 1)
);
