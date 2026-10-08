import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showDialog } from '../../components/AppDialog';
import PlayerName, { CosmeticBorder } from '../../components/PlayerName';
import { useApp } from '../../context/AppContext';
import { Cosmetics, SHOP_KIND_HINTS, SHOP_KIND_LABELS, ShopItem } from '../../data/shop';
import {
  useEquipShopItemMutation,
  useOwnedShopItemsQuery,
  usePurchaseShopItemMutation,
  useShopItemsQuery,
} from '../../hooks/useShopQueries';
import { borderStyleFor, groupShopItems, pointsShort, safeNameColor, shopItemState } from '../../utils/shop-utils';
import { useThemeColors } from '../../utils/theme-utils';

/**
 * The shop: where a player spends the points they've earned on things to wear - a title under
 * their name, a color for their name, and a border for their profile card. Everything is
 * cosmetic and drawn from text and color, so nothing here needs artwork.
 * The top shows their points and a live preview of their current look. Below are the three
 * sections; each item shows its price, or "Wear" / "Wearing" once owned. Buying asks first,
 * and once the item is bought a second pop-up offers to wear it now or leave things as they are. Points spent here never lower a player's Score or their
 * all-time total - only the spendable balance.
 * The catalog, prices, balance, and what each player owns all live on the server; this screen
 * only asks for a purchase and shows the answer. It is reached from the points badge on Home
 * and from the Profile tab (the tab-bar entry is still switched off - see (tabs)/_layout.tsx).
 * Parameters: none; reads currentUser and session from global context.
 * Returns: a scrollable shop screen; null when no user is logged in.
 * Edge cases: shows a spinner while the catalog loads and a retry card if it can't be loaded;
 * an item the player can't afford shows how many more points it needs and can't be tapped;
 * early-supporter items the player joined too late for are not listed at all; a purchase the
 * server refuses (not enough points, no longer for sale) shows the server's reason and changes
 * nothing; only one purchase or change can be in flight at a time, so a double tap can't buy
 * twice (and the server would charge nothing for a repeat anyway).
 */
export default function ShopScreen() {
  const router = useRouter();
  const { currentUser, session } = useApp();
  const colors = useThemeColors();
  const userId = session?.user.id;

  const itemsQuery = useShopItemsQuery();
  const ownedQuery = useOwnedShopItemsQuery(userId);
  const purchaseMutation = usePurchaseShopItemMutation();
  const equipMutation = useEquipShopItemMutation();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  if (!currentUser || !userId) return null;

  const cosmetics: Cosmetics = {
    title: currentUser.title,
    nameColor: currentUser.nameColor,
    cardBorder: currentUser.cardBorder,
  };
  const ownedIds = new Set(ownedQuery.data ?? []);
  const balance = currentUser.pointBalance;
  const busy = busyItemId !== null;

  const sections = groupShopItems(itemsQuery.data ?? [])
    .map((section) => ({
      ...section,
      items: section.items
        .map((item) => ({ item, state: shopItemState(item, ownedIds, balance, cosmetics, currentUser.createdAt) }))
        .filter((entry) => entry.state !== 'unavailable'),
    }))
    .filter((section) => section.items.length > 0);

  /**
   * Puts an owned item on, or takes it off if it is the one currently worn.
   * Parameters: item (an item the player owns), wearing (whether it is on right now).
   * Returns: a promise that resolves once the change is saved or refused.
   * Edge cases: does nothing while another purchase or change is in flight; a refusal from the
   * server is shown as an alert and the look stays as it was.
   */
  const toggleWear = async (item: ShopItem, wearing: boolean) => {
    if (busy) return;
    setBusyItemId(item.id);
    try {
      await equipMutation.mutateAsync({ userId, kind: item.kind, itemId: wearing ? null : item.id });
      Haptics.selectionAsync();
    } catch (err) {
      showDialog('Couldn’t change your look', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyItemId(null);
    }
  };

  /**
   * Buys an item. The server takes the points and records the purchase in one step. Nothing is
   * put on: the confirmation that follows asks whether to wear it now, and saying no leaves the
   * player's look exactly as it was, with the new item waiting in the list as "Wear".
   * Parameters: item (the item to buy).
   * Returns: a promise that resolves once the purchase has gone through or been refused.
   * Edge cases: does nothing while another purchase or change is in flight; if the purchase is
   * refused nothing is spent and the server's reason is shown; choosing "Wear it now" goes
   * through toggleWear, so a failure there is reported and the item is still owned.
   */
  const buy = async (item: ShopItem) => {
    if (busy) return;
    setBusyItemId(item.id);
    try {
      await purchaseMutation.mutateAsync({ userId, itemId: item.id });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showDialog(
        `“${item.name}” is yours`,
        'Want to wear it now? You can change what you wear any time, here or on your Profile tab.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Wear It Now', onPress: () => toggleWear(item, false) },
        ]
      );
    } catch (err) {
      showDialog('Couldn’t buy that', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusyItemId(null);
    }
  };

  const confirmBuy = (item: ShopItem) => {
    if (busy) return;
    showDialog(
      item.price === 0 ? `Claim “${item.name}”?` : `Buy “${item.name}”?`,
      item.price === 0
        ? 'It’s free, and yours to keep.'
        : `This costs ${item.price} points. You’ll have ${balance - item.price} left. Your Score and all-time total don’t change.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: item.price === 0 ? 'Claim' : 'Buy', onPress: () => buy(item) },
      ]
    );
  };

  const renderPreview = (item: ShopItem) => {
    if (item.kind === 'title') {
      return <Text style={[styles.previewTitle, { color: colors.textBody }]}>“{item.value}”</Text>;
    }
    if (item.kind === 'name_color') {
      const color = safeNameColor(item.value);
      return (
        <View style={styles.previewRow}>
          <View style={[styles.swatch, { backgroundColor: color ?? colors.border }]} />
          <Text style={[styles.previewName, color !== undefined && { color }]}>
            {currentUser.displayName ?? currentUser.username}
          </Text>
        </View>
      );
    }
    const border = borderStyleFor(item.value);
    return (
      <View style={styles.previewRow}>
        <View style={[styles.borderSwatch, { borderColor: border?.outer ?? colors.border, borderWidth: border?.width ?? 1 }]}>
          <View style={[styles.borderSwatchInner, border?.inner !== undefined && { borderColor: border.inner, borderWidth: border.width }]} />
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8}>
        <Text style={[styles.back, { color: colors.accentText }]}>← Back</Text>
      </Pressable>
      <Text style={[styles.heading, { color: colors.textPrimary }]}>Shop</Text>

      <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={styles.balanceLabel}>YOUR POINTS</Text>
        <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>{balance}</Text>
        <Text style={[styles.balanceHint, { color: colors.textSecondary }]}>
          You earn points by playing rounds. Spending them here never lowers your Score on the leaderboard or your all-time total.
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Your look</Text>
      <CosmeticBorder borderKey={cosmetics.cardBorder} radius={14} style={styles.lookWrap}>
        <View style={[styles.lookCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PlayerName
            name={currentUser.displayName ?? currentUser.username}
            cosmetics={cosmetics}
            style={[styles.lookName, { color: colors.textPrimary }]}
          />
          {!cosmetics.title && !cosmetics.nameColor && !cosmetics.cardBorder && (
            <Text style={[styles.lookEmpty, { color: colors.textMuted }]}>Nothing on yet - pick something below.</Text>
          )}
        </View>
      </CosmeticBorder>

      {itemsQuery.isLoading || ownedQuery.isLoading ? (
        <ActivityIndicator color="#007AFF" style={styles.spinner} />
      ) : itemsQuery.isError || ownedQuery.isError ? (
        <View style={[styles.messageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>Couldn’t load the shop</Text>
          <Text style={[styles.messageBody, { color: colors.textBody }]}>Check your connection and try again.</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => { itemsQuery.refetch(); ownedQuery.refetch(); }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : sections.length === 0 ? (
        <Text style={[styles.messageBody, { color: colors.textBody }]}>Nothing is for sale right now.</Text>
      ) : (
        sections.map((section) => (
          <View key={section.kind} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{SHOP_KIND_LABELS[section.kind]}</Text>
            <Text style={[styles.sectionHint, { color: colors.textMuted }]}>{SHOP_KIND_HINTS[section.kind]}</Text>
            {section.items.map(({ item, state }) => {
              const owned = state === 'owned' || state === 'equipped';
              const disabled = busy || state === 'too_expensive';
              const priceLabel = item.price === 0 ? 'Free' : `${item.price} pts`;
              return (
                <View
                  key={item.id}
                  style={[
                    styles.itemCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    state === 'equipped' && styles.itemCardEquipped,
                  ]}
                >
                  <View style={styles.itemInfo}>
                    {renderPreview(item)}
                    <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
                    {item.description !== '' && (
                      <Text style={[styles.itemDesc, { color: colors.textSecondary }]}>{item.description}</Text>
                    )}
                    {item.joinedBefore !== undefined && <Text style={styles.earlyBadge}>EARLY SUPPORTER</Text>}
                    {state === 'too_expensive' && (
                      <Text style={[styles.itemShort, { color: colors.textMuted }]}>
                        {pointsShort(item, balance)} more points to go
                      </Text>
                    )}
                  </View>
                  <Pressable
                    style={[
                      styles.itemButton,
                      owned ? styles.itemButtonOwned : styles.itemButtonBuy,
                      state === 'equipped' && styles.itemButtonEquipped,
                      disabled && styles.itemButtonDisabled,
                    ]}
                    onPress={() => (owned ? toggleWear(item, state === 'equipped') : confirmBuy(item))}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={
                      state === 'equipped' ? `Take off ${item.name}`
                        : state === 'owned' ? `Wear ${item.name}`
                        : `${item.price === 0 ? 'Claim' : 'Buy'} ${item.name} for ${priceLabel}`
                    }
                    accessibilityState={{ disabled, selected: state === 'equipped' }}
                  >
                    {busyItemId === item.id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={[styles.itemButtonText, state === 'owned' && styles.itemButtonTextOwned]}>
                        {state === 'equipped' ? 'Wearing ✓' : state === 'owned' ? 'Wear' : priceLabel}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  back: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 14,
  },
  balanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#007AFF',
  },
  balanceValue: {
    fontSize: 44,
    fontWeight: '800',
    marginVertical: 2,
  },
  balanceHint: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 4,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  lookWrap: {
    alignSelf: 'stretch',
  },
  lookCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  lookName: {
    fontSize: 20,
    fontWeight: '800',
  },
  lookEmpty: {
    fontSize: 12,
    marginTop: 4,
  },
  spinner: {
    marginTop: 30,
  },
  messageCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginTop: 22,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  messageBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  itemCardEquipped: {
    borderColor: '#34C759',
  },
  itemInfo: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  swatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  borderSwatch: {
    width: 46,
    height: 30,
    borderRadius: 8,
  },
  borderSwatchInner: {
    flex: 1,
    borderRadius: 6,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  itemShort: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  earlyBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#D9A520',
    marginTop: 4,
  },
  itemButton: {
    minWidth: 92,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemButtonBuy: {
    backgroundColor: '#007AFF',
  },
  itemButtonOwned: {
    borderWidth: 1.5,
    borderColor: '#34C759',
  },
  itemButtonEquipped: {
    backgroundColor: '#34C759',
  },
  itemButtonDisabled: {
    opacity: 0.4,
  },
  itemButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  itemButtonTextOwned: {
    color: '#34C759',
  },
});
