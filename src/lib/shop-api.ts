import { supabase } from './supabase';
import { ShopItem, ShopItemKind } from '../data/shop';

interface ShopItemRow {
  id: string;
  kind: ShopItemKind;
  name: string;
  value: string;
  description: string;
  price: number;
  sort_order: number;
  joined_before: string | null;
}

/**
 * Converts a `shop_items` row into the app's ShopItem shape, keeping the database's column
 * naming out of the rest of the app.
 * Parameters: row (a shop_items row).
 * Returns: the matching ShopItem.
 * Edge cases: a NULL joined_before becomes an absent joinedBefore (not an early-supporter item).
 */
export const mapShopItemRow = (row: ShopItemRow): ShopItem => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  value: row.value,
  description: row.description,
  price: row.price,
  sortOrder: row.sort_order,
  joinedBefore: row.joined_before ? new Date(row.joined_before).getTime() : undefined,
});

/**
 * Fetches everything currently for sale. Items that have been turned off are left out, so they
 * disappear from the shop without anyone who owns one losing it.
 * Parameters: none.
 * Returns: the active catalog, in the database's display order.
 * Edge cases: returns an empty array if nothing is for sale; throws on a Postgres/network error
 * or if the caller isn't signed in (the catalog is readable by signed-in players only).
 */
export const fetchShopItems = async (): Promise<ShopItem[]> => {
  const { data, error } = await supabase
    .from('shop_items')
    .select('id, kind, name, value, description, price, sort_order, joined_before')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as ShopItemRow[]).map(mapShopItemRow);
};

/**
 * Fetches the ids of the items the signed-in player has bought. Row-level security returns only
 * the caller's own purchases, so no player id needs to be (or can usefully be) passed.
 * Parameters: none.
 * Returns: the owned item ids.
 * Edge cases: returns an empty array for a player who has bought nothing; includes items that
 * have since been turned off, which they still own.
 */
export const fetchOwnedShopItemIds = async (): Promise<string[]> => {
  const { data, error } = await supabase.from('shop_purchases').select('item_id');
  if (error) throw error;
  return (data as { item_id: string }[]).map((row) => row.item_id);
};

/**
 * Buys one item with the signed-in player's points, through the purchase_shop_item SQL function.
 * The server looks up the price, checks the balance, takes the points, and records the purchase
 * in one step, so the app never sends a price and can't be made to under-pay.
 * Parameters: itemId.
 * Returns: the player's balance after the purchase.
 * Edge cases: throws with the server's own message if they can't afford it ("Not enough
 * points"), it is no longer for sale, or it was only for early supporters; buying something
 * already owned charges nothing and returns the unchanged balance, so a double tap is safe.
 */
export const purchaseShopItem = async (itemId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('purchase_shop_item', { p_item_id: itemId });
  if (error) throw error;
  return data as number;
};

/**
 * Puts on one of the player's own items, or takes off whatever is in that slot, through the
 * equip_shop_item SQL function. What a player wears is stored on their profile, where every
 * other player's app reads it from.
 * Parameters: kind (the slot), itemId (the item to wear, or null to take the slot's item off).
 * Returns: a promise that resolves once the profile is updated.
 * Edge cases: throws if the player doesn't own the item or it belongs to a different slot;
 * taking off an empty slot, or wearing what is already worn, changes nothing.
 */
export const equipShopItem = async (kind: ShopItemKind, itemId: string | null): Promise<void> => {
  const { error } = await supabase.rpc('equip_shop_item', { p_kind: kind, p_item_id: itemId });
  if (error) throw error;
};
