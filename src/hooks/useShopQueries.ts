import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShopItemKind } from '../data/shop';
import { equipShopItem, fetchOwnedShopItemIds, fetchShopItems, purchaseShopItem } from '../lib/shop-api';
import { groupKeys } from './useGroupQueries';
import { profileKeys } from './useProfileQueries';

/**
 * Query key factory for shop data, keeping every call site's cache key in one place.
 * Parameters: owned() takes the signed-in player's id, so one player's purchases are never
 * served from the cache to the next person who signs in on the same phone.
 * Returns: the catalog key and a per-player purchases key.
 * Edge cases: userId may be undefined while the session loads; callers gate the query with
 * `enabled` rather than avoiding the key.
 */
export const shopKeys = {
  items: ['shop', 'items'] as const,
  owned: (userId: string | undefined) => ['shop', 'owned', userId] as const,
};

/**
 * Fetches and caches everything currently for sale. The catalog changes rarely, so it is kept
 * fresh for ten minutes rather than refetched on every visit to the shop.
 * Parameters: none.
 * Returns: the standard React Query result; `data` is the list of ShopItem.
 * Edge cases: none beyond the standard query error path.
 */
export const useShopItemsQuery = () =>
  useQuery({ queryKey: shopKeys.items, queryFn: fetchShopItems, staleTime: 10 * 60 * 1000 });

/**
 * Fetches and caches the ids of the items the signed-in player owns.
 * Parameters: userId (the signed-in player's id, or undefined while the session is loading).
 * Returns: the standard React Query result; `data` is an array of item ids.
 * Edge cases: disabled while userId is undefined, so it never fires signed out.
 */
export const useOwnedShopItemsQuery = (userId: string | undefined) =>
  useQuery({ queryKey: shopKeys.owned(userId), queryFn: fetchOwnedShopItemIds, enabled: !!userId });

/**
 * Buys an item, then refreshes the player's purchases and their profile (whose balance the
 * server has just lowered). Nothing is updated optimistically: points are only shown as spent
 * once the server says they were.
 * Parameters: none - call sites pass `{ userId, itemId }`.
 * Returns: a React Query mutation object whose result is the new balance.
 * Edge cases: on failure (not enough points, no longer for sale) nothing is invalidated and the
 * server's message reaches the caller through mutateAsync's rejected promise.
 */
export const usePurchaseShopItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }: { userId: string; itemId: string }) => purchaseShopItem(itemId),
    onSuccess: (_balance, { userId }) => {
      queryClient.invalidateQueries({ queryKey: shopKeys.owned(userId) });
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
    },
  });
};

/**
 * Puts an owned item on, or takes a slot's item off, then refreshes the player's profile and
 * the group lists (whose rosters show each player's title and name color).
 * Parameters: none - call sites pass `{ userId, kind, itemId }`, with itemId null to take off.
 * Returns: a React Query mutation object.
 * Edge cases: on failure (the item isn't owned) nothing is invalidated and the error reaches
 * the caller through mutateAsync's rejected promise.
 */
export const useEquipShopItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, itemId }: { userId: string; kind: ShopItemKind; itemId: string | null }) =>
      equipShopItem(kind, itemId),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: profileKeys.detail(userId) });
      queryClient.invalidateQueries({ queryKey: groupKeys.list() });
      // Prefix match: every cached single-group query, whichever group it is for.
      queryClient.invalidateQueries({ queryKey: ['group'] });
    },
  });
};
