/** The three things a player can buy and wear. Matches `shop_items.kind` in the database. */
export type ShopItemKind = 'title' | 'name_color' | 'card_border';

/** The order the shop lists its sections in. */
export const SHOP_KINDS: ShopItemKind[] = ['title', 'name_color', 'card_border'];

export const SHOP_KIND_LABELS: Record<ShopItemKind, string> = {
  title: 'Titles',
  name_color: 'Name Colors',
  card_border: 'Card Borders',
};

export const SHOP_KIND_HINTS: Record<ShopItemKind, string> = {
  title: 'A line under your name in groups, on your profile, and on the leaderboard.',
  name_color: 'The color your name is written in wherever other players see it.',
  card_border: 'A border around your card on your profile.',
};

/**
 * One thing for sale. Mirrors a `shop_items` row (see
 * supabase/migrations/20261007150000_point_balance_and_shop.sql). The catalog lives in the
 * database, not in the app, so prices can't be changed by editing a build and new items don't
 * need a release.
 */
export interface ShopItem {
  id: string;
  kind: ShopItemKind;
  /** What the shop calls it. */
  name: string;
  /** What wearing it shows: the title's text, a "#RRGGBB" color, or a BORDER_STYLES key. */
  value: string;
  description: string;
  price: number;
  sortOrder: number;
  /** Early-supporter items: only profiles created before this time (epoch ms) can get it. */
  joinedBefore?: number;
}

/** What a player is currently wearing, as stored on their profile. Each is absent when unset. */
export interface Cosmetics {
  title?: string;
  nameColor?: string;
  cardBorder?: string;
}

/** How a card border is drawn: an outer line, and optionally a second line just inside it. */
export interface BorderStyle {
  outer: string;
  inner?: string;
  width: number;
}

// Every border the shop sells is drawn from plain colors, so none of them needs artwork. The
// keys are the `value` of the card_border rows in the catalog; a key the app doesn't know (an
// item added to the catalog before the app learned to draw it) simply draws no border.
export const BORDER_STYLES: Record<string, BorderStyle> = {
  obsidian: { outer: '#4A4A5E', width: 3 },
  bronze: { outer: '#B0763C', width: 2 },
  silver: { outer: '#B8C0CC', width: 2 },
  gold: { outer: '#E0B030', inner: '#FFE9A0', width: 2 },
  ember: { outer: '#E0B030', inner: '#FF6B4A', width: 2 },
  arcane: { outer: '#3D9BFF', inner: '#A070FF', width: 2 },
  verdant: { outer: '#1FB5A8', inner: '#2FBF71', width: 2 },
  founder: { outer: '#E0B030', inner: '#FFFFFF', width: 2 },
};
