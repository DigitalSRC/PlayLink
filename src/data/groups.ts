import { GameType, NoGoRule } from './types';

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
  gameType: GameType;
  format: string;
  noGo: NoGoRule[];
  confirmed: boolean;
}

export const HARDCODED_GROUPS: Group[] = [
  {
    id: 1,
    name: 'Friday Night Commander',
    gameType: 'mtg',
    format: 'Commander',
    bracket: 2,
    location: 'Riverside Park',
    time: 'Friday · 7:00 PM',
    players: [
      { id: 1001, username: 'Lucas Webb', bracket: 2, location: 'Riverside Park', role: 'Host' },
      { id: 1002, username: 'Kai Torres', bracket: 2, location: 'Northside Rec Center', role: 'Member' },
      { id: 1003, username: 'Elena Voss', bracket: 2, location: 'Eastside Brewery', role: 'Member' },
    ],
    targetPlayers: 4,
    noGo: ['Infinites', 'Extra Turns'],
    confirmed: false,
  },
  {
    id: 2,
    name: 'Saturday Draft Night',
    gameType: 'mtg',
    format: 'Draft',
    bracket: 3,
    location: 'Downtown Library',
    time: 'Saturday · 2:00 PM',
    players: [
      { id: 2001, username: 'Sarah Chen', bracket: 3, location: 'Downtown Library', role: 'Host' },
      { id: 2002, username: 'Marcus Bell', bracket: 3, location: 'University Union', role: 'Member' },
      { id: 2003, username: 'Cole Westbrook', bracket: 3, location: 'Highland Hall', role: 'Member' },
      { id: 2004, username: 'Priya Sharma', bracket: 2, location: 'Brookside Commons', role: 'Member' },
      { id: 2005, username: 'Aria Mendez', bracket: 1, location: 'Bluebird Plaza', role: 'Member' },
    ],
    targetPlayers: 8,
    noGo: [],
    confirmed: false,
  },
  {
    id: 3,
    name: 'Pokémon Standard Showdown',
    gameType: 'pokemon',
    format: 'Standard',
    bracket: 2,
    location: 'Maple Street Café',
    time: 'Sunday · 12:30 PM',
    players: [
      { id: 3001, username: 'Zoe Nakamura', bracket: 2, location: 'Willow Creek Cafe', role: 'Host' },
      { id: 3002, username: 'Maya Patel', bracket: 1, location: 'Maple Street Café', role: 'Member' },
    ],
    targetPlayers: 4,
    noGo: ['Infinites'],
    confirmed: false,
  },
  {
    id: 4,
    name: 'Pioneer Monday Grind',
    gameType: 'mtg',
    format: 'Pioneer',
    bracket: 3,
    location: 'University Union',
    time: 'Monday · 6:00 PM',
    players: [
      { id: 4001, username: 'Jake Rivers', bracket: 4, location: 'Main Street Arcade', role: 'Host' },
      { id: 4002, username: 'Cole Westbrook', bracket: 3, location: 'Highland Hall', role: 'Member' },
      { id: 4003, username: 'Sarah Chen', bracket: 3, location: 'Downtown Library', role: 'Member' },
    ],
    targetPlayers: 5,
    noGo: [],
    confirmed: false,
  },
  {
    id: 5,
    name: 'Lorcana League Night',
    gameType: 'lorcana',
    format: 'Constructed',
    bracket: 1,
    location: 'Bluebird Plaza',
    time: 'Wednesday · 7:00 PM',
    players: [
      { id: 5001, username: 'Aria Mendez', bracket: 1, location: 'Bluebird Plaza', role: 'Host' },
      { id: 5002, username: 'Maya Patel', bracket: 1, location: 'Maple Street Café', role: 'Member' },
    ],
    targetPlayers: 4,
    noGo: [],
    confirmed: false,
  },
  {
    id: 6,
    name: 'One Piece Grand Line Duel',
    gameType: 'onepiece',
    format: 'OP',
    bracket: 2,
    location: 'Harbor Market',
    time: 'Saturday · 5:30 PM',
    players: [
      { id: 6001, username: 'Ryan Okafor', bracket: 1, location: 'Harbor Market', role: 'Host' },
      { id: 6002, username: 'Elena Voss', bracket: 2, location: 'Eastside Brewery', role: 'Member' },
    ],
    targetPlayers: 4,
    noGo: [],
    confirmed: false,
  },
  {
    id: 7,
    name: 'Casual Commander Hangout',
    gameType: 'mtg',
    format: 'Commander',
    bracket: 1,
    location: 'Brookside Commons',
    time: 'Sunday · 3:00 PM',
    players: [
      { id: 7001, username: 'Priya Sharma', bracket: 2, location: 'Brookside Commons', role: 'Host' },
    ],
    targetPlayers: 4,
    noGo: ['Infinites', 'Extra Turns', 'Game Changers'],
    confirmed: false,
  },
  {
    id: 8,
    name: 'Pokémon Draft League',
    gameType: 'pokemon',
    format: 'Limited',
    bracket: 1,
    location: 'Northside Rec Center',
    time: 'Thursday · 6:30 PM',
    players: [
      { id: 8001, username: 'Zoe Nakamura', bracket: 2, location: 'Willow Creek Cafe', role: 'Host' },
      { id: 8002, username: 'Lucas Webb', bracket: 2, location: 'Riverside Park', role: 'Member' },
    ],
    targetPlayers: 6,
    noGo: [],
    confirmed: false,
  },
];
