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

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

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
