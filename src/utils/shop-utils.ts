import { BORDER_STYLES, BorderStyle, Cosmetics, SHOP_KINDS, ShopItem, ShopItemKind } from '../data/shop';

/** What the shop can do with an item for the player looking at it. */
export type ShopItemState =
  /** They own it and it is on. */
  | 'equipped'
  /** They own it and it is off. */
  | 'owned'
  /** They can buy it right now. */
  | 'affordable'
  /** They don't have enough points yet. */
  | 'too_expensive'
  /** An early-supporter item, and their profile was created too late. */
  | 'unavailable';

const HEX_COLOR = /^#[0-9A-F]{6}$/;

/**
 * Sorts the catalog into the shop's three sections, each in its own display order. The shop
 * screen renders one block per section from this.
 * Parameters: items (the whole catalog, in any order).
 * Returns: one entry per kind, in SHOP_KINDS order, each holding that kind's items sorted by
 * sortOrder, then price, then name.
 * Edge cases: a kind with nothing for sale is still returned, with an empty list, so the caller
 * decides whether to show it; an item of a kind the app doesn't know is left out.
 */
export const groupShopItems = (items: ShopItem[]): { kind: ShopItemKind; items: ShopItem[] }[] =>
  SHOP_KINDS.map((kind) => ({
    kind,
    items: items
      .filter((item) => item.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price || a.name.localeCompare(b.name)),
  }));

/**
 * Reads which item value a player is wearing in one slot. Lets the shop tell "equipped" from
 * merely "owned" by comparing an item's value to what is on the profile.
 * Parameters: cosmetics (what the profile has on), kind (the slot).
 * Returns: the worn value, or undefined when the slot is empty.
 * Edge cases: none - an empty slot is simply undefined.
 */
export const wornValue = (cosmetics: Cosmetics, kind: ShopItemKind): string | undefined =>
  kind === 'title' ? cosmetics.title : kind === 'name_color' ? cosmetics.nameColor : cosmetics.cardBorder;

/**
 * Works out what the shop should offer for one item: whether the player already has it, is
 * wearing it, can afford it, or can't get it at all. This only decides what the screen shows -
 * the server re-checks every one of these rules when a purchase is actually made.
 * Parameters: item (the catalog item), ownedIds (ids the player has bought), balance (their
 * spendable points), cosmetics (what they're wearing), joinedAt (when their profile was
 * created, epoch ms, or undefined if unknown).
 * Returns: one ShopItemState.
 * Edge cases: owning an item wins over everything else, so an early-supporter item a player
 * already has stays wearable after the cutoff; an early-supporter item with an unknown join
 * date is treated as unavailable rather than offered and then refused; a free item is
 * "affordable" even with a balance of zero; a negative or non-finite balance affords nothing
 * that costs anything.
 */
export const shopItemState = (
  item: ShopItem,
  ownedIds: ReadonlySet<string>,
  balance: number,
  cosmetics: Cosmetics,
  joinedAt?: number
): ShopItemState => {
  if (ownedIds.has(item.id)) {
    return wornValue(cosmetics, item.kind) === item.value ? 'equipped' : 'owned';
  }
  if (item.joinedBefore !== undefined && (joinedAt === undefined || joinedAt >= item.joinedBefore)) {
    return 'unavailable';
  }
  const spendable = Number.isFinite(balance) ? balance : 0;
  return spendable >= item.price ? 'affordable' : 'too_expensive';
};

/**
 * Says how many more points a player needs for an item, for the "N more to go" line under
 * things they can't afford yet.
 * Parameters: item, balance (their spendable points).
 * Returns: the shortfall, or 0 when they already have enough.
 * Edge cases: never negative; a non-finite balance counts as zero.
 */
export const pointsShort = (item: ShopItem, balance: number): number =>
  Math.max(0, item.price - (Number.isFinite(balance) ? balance : 0));

/**
 * Returns a name color only if it is safe to hand to a text style. Colors come from another
 * player's profile row, so anything that isn't exactly "#RRGGBB" is ignored and the name falls
 * back to the screen's normal color.
 * Parameters: color (the profile's name_color, possibly undefined).
 * Returns: the color, or undefined.
 * Edge cases: lowercase hex, shorthand "#FFF", named colors, and empty strings all return
 * undefined - the server only ever stores uppercase six-digit hex.
 */
export const safeNameColor = (color: string | undefined | null): string | undefined =>
  typeof color === 'string' && HEX_COLOR.test(color) ? color : undefined;

/**
 * Looks up how to draw a card border from the key stored on a profile.
 * Parameters: key (the profile's card_border, possibly undefined).
 * Returns: the border's colors and width, or undefined when there is none to draw.
 * Edge cases: an unknown key (a border added to the catalog before this build knew how to draw
 * it) returns undefined, so the card is drawn plain rather than breaking; inherited object keys
 * like "toString" are not treated as borders.
 */
export const borderStyleFor = (key: string | undefined | null): BorderStyle | undefined =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(BORDER_STYLES, key)
    ? BORDER_STYLES[key]
    : undefined;
