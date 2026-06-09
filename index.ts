/**
 * @podfinder/types
 *
 * Single source of truth for every data model in PodFinder.
 * Imported by mobile, web, and backend — never duplicated.
 *
 * Naming conventions:
 *   - Types/interfaces: PascalCase
 *   - Enums: PascalCase with string values
 *   - ID fields: always `string` (UUID from the DB)
 *   - Timestamps: ISO 8601 string for serialization safety across platforms
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

/**
 * Official WotC bracket system — 5 tiers.
 * Used as the primary compatibility signal between players and pods.
 *
 *   1 — Precon (unmodified or very lightly changed)
 *   2 — Casual (modified precon / budget brews)
 *   3 — Optimized (tuned lists, synergy-focused)
 *   4 — High power (near-cEDH, strong engines and interaction)
 *   5 — cEDH (competitive, maximally optimized)
 */
export enum Bracket {
  One   = "1",
  Two   = "2",
  Three = "3",
  Four  = "4",
  Five  = "5",
}

export enum Format {
  Commander = "commander",
  Modern    = "modern",
  Standard  = "standard",
  Pioneer   = "pioneer",
  Legacy    = "legacy",
  Vintage   = "vintage",
  Draft     = "draft",
  Sealed    = "sealed",
  Pauper    = "pauper",
  Casual    = "casual",
}

export enum DayOfWeek {
  Monday    = "monday",
  Tuesday   = "tuesday",
  Wednesday = "wednesday",
  Thursday  = "thursday",
  Friday    = "friday",
  Saturday  = "saturday",
  Sunday    = "sunday",
}

export enum TimeSlot {
  Morning   = "morning",    // 8am–12pm
  Afternoon = "afternoon",  // 12pm–5pm
  Evening   = "evening",    // 5pm–9pm
  LateNight = "late_night", // 9pm+
}

export enum PodStatus {
  Open     = "open",     // Actively recruiting
  Full     = "full",     // No open seats
  Paused   = "paused",   // Temporarily not recruiting
  Archived = "archived", // No longer active
}

export enum RequestStatus {
  Pending   = "pending",
  Accepted  = "accepted",
  Declined  = "declined",
  Withdrawn = "withdrawn",
}

export enum MessageStatus {
  Sent      = "sent",
  Delivered = "delivered",
  Read      = "read",
}

// ─── Core models ──────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;

  /** City name shown in UI. Derived from coordinates — never stored raw. */
  locationLabel: string;
  /** Used for proximity search. Not exposed to other users. */
  coordinates: Coordinates | null;

  brackets: Bracket[];
  formats: Format[];
  availability: Availability;

  bio: string;

  createdAt: string;
  updatedAt: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Availability {
  days: DayOfWeek[];
  timeSlots: TimeSlot[];
}

export interface Pod {
  id: string;
  name: string;
  hostId: string;

  bracket: Bracket;
  formats: Format[];
  availability: Availability;

  locationLabel: string;
  coordinates: Coordinates | null;
  venueName: string | null;
  venueAddress: string | null;

  maxPlayers: number;
  currentPlayerCount: number;
  openSeats: number;

  description: string;
  status: PodStatus;

  nextSessionAt: string | null;

  memberIds: string[];

  createdAt: string;
  updatedAt: string;
}

export interface JoinRequest {
  id: string;
  podId: string;
  playerId: string;
  status: RequestStatus;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  podId: string;
  participantIds: string[];
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  status: MessageStatus;
  createdAt: string;
}

export interface Session {
  id: string;
  podId: string;
  scheduledAt: string;
  locationLabel: string;
  coordinates: Coordinates | null;
  venueName: string | null;
  confirmedPlayerIds: string[];
  notes: string | null;
  createdAt: string;
}

// ─── API shapes ───────────────────────────────────────────────────────────────

/** Returned by GET /pods — enriched with distance for the requesting user */
export interface PodListItem extends Pod {
  distanceMiles: number | null;
}

/** Payload for creating or updating a user's profile */
export type UpsertProfilePayload = Pick<
  UserProfile,
  "displayName" | "brackets" | "formats" | "availability" | "bio"
> & {
  avatarUrl?: string | null;
};

/** Payload for creating a new pod */
export type CreatePodPayload = Pick<
  Pod,
  | "name"
  | "bracket"
  | "formats"
  | "availability"
  | "maxPlayers"
  | "description"
  | "venueName"
  | "venueAddress"
> & {
  coordinates?: Coordinates;
};

/** Payload for sending a message */
export type SendMessagePayload = {
  conversationId: string;
  body: string;
};

// ─── UI / display helpers ─────────────────────────────────────────────────────

export const BRACKET_LABELS: Record<Bracket, string> = {
  [Bracket.One]:   "Bracket 1 — Precon",
  [Bracket.Two]:   "Bracket 2 — Casual",
  [Bracket.Three]: "Bracket 3 — Optimized",
  [Bracket.Four]:  "Bracket 4 — High power",
  [Bracket.Five]:  "Bracket 5 — cEDH",
};

export const BRACKET_DESCRIPTIONS: Record<Bracket, string> = {
  [Bracket.One]:   "Unmodified or lightly changed precons",
  [Bracket.Two]:   "Modified precons and budget brews",
  [Bracket.Three]: "Tuned, synergy-focused lists",
  [Bracket.Four]:  "Near-cEDH, strong engines and interaction",
  [Bracket.Five]:  "Competitive, maximally optimized",
};

export const FORMAT_LABELS: Record<Format, string> = {
  [Format.Commander]: "Commander / EDH",
  [Format.Modern]:    "Modern",
  [Format.Standard]:  "Standard",
  [Format.Pioneer]:   "Pioneer",
  [Format.Legacy]:    "Legacy",
  [Format.Vintage]:   "Vintage",
  [Format.Draft]:     "Draft",
  [Format.Sealed]:    "Sealed",
  [Format.Pauper]:    "Pauper",
  [Format.Casual]:    "Casual",
};

export const DAY_LABELS: Record<DayOfWeek, string> = {
  [DayOfWeek.Monday]:    "Mon",
  [DayOfWeek.Tuesday]:   "Tue",
  [DayOfWeek.Wednesday]: "Wed",
  [DayOfWeek.Thursday]:  "Thu",
  [DayOfWeek.Friday]:    "Fri",
  [DayOfWeek.Saturday]:  "Sat",
  [DayOfWeek.Sunday]:    "Sun",
};

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  [TimeSlot.Morning]:   "Morning",
  [TimeSlot.Afternoon]: "Afternoon",
  [TimeSlot.Evening]:   "Evening",
  [TimeSlot.LateNight]: "Late night",
};
