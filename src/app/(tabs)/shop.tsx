import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';

/**
 * Shop tab — placeholder for the upcoming cosmetic rewards store.
 * Displays the player's current Points balance and a coming-soon notice.
 * Parameters: none; reads currentUser from global context.
 * Returns: a scrollable placeholder shop screen.
 * Edge cases: returns null if currentUser is not yet set (unauthenticated state).
 */
export default function ShopScreen() {
  const { currentUser } = useApp();

  if (!currentUser) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Shop</Text>

      {/* Points balance */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
        <Text style={styles.balanceValue}>{currentUser.points}</Text>
        <Text style={styles.balanceUnit}>Points</Text>
      </View>

      {/* Coming soon banner */}
      <View style={styles.comingSoonCard}>
        <Text style={styles.comingSoonEmoji}>🛍️</Text>
        <Text style={styles.comingSoonTitle}>Rewards Coming Soon!</Text>
        <Text style={styles.comingSoonBody}>
          Spend your Points on cosmetic rewards — profile borders, card sleeves,
          avatars, and more. Keep earning Points in groups to be ready when the
          shop opens.
        </Text>
      </View>

      {/* Placeholder item slots */}
      <Text style={styles.sectionTitle}>Preview Items</Text>
      {PREVIEW_ITEMS.map((item) => (
        <View key={item.name} style={styles.itemCard}>
          <View style={styles.itemIconBox}>
            <Text style={styles.itemIcon}>{item.icon}</Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemDesc}>{item.desc}</Text>
          </View>
          <View style={styles.itemCostBox}>
            <Text style={styles.itemCost}>{item.cost}</Text>
            <Text style={styles.itemCostLabel}>pts</Text>
          </View>
        </View>
      ))}

      <Text style={styles.footerNote}>
        Prices and availability are subject to change before launch.
      </Text>
    </ScrollView>
  );
}

const PREVIEW_ITEMS = [
  { icon: '🖼️', name: 'Foil Border', desc: 'Shimmering border for your profile card', cost: 500 },
  { icon: '🏆', name: 'Gold Frame', desc: 'Golden frame unlocked by top performers', cost: 1200 },
  { icon: '🎭', name: 'Custom Avatar', desc: 'Choose from exclusive avatar designs', cost: 800 },
  { icon: '🃏', name: 'Sleeve Design', desc: 'Unique card sleeve shown in groups', cost: 350 },
  { icon: '💬', name: 'Chat Badge', desc: 'Exclusive badge displayed in group chat', cost: 250 },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  heading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 24,
  },
  balanceCard: {
    backgroundColor: '#001A3D',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFF',
    lineHeight: 58,
  },
  balanceUnit: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 4,
  },
  comingSoonCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  comingSoonEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  comingSoonBody: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C38',
    opacity: 0.6,
  },
  itemIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  itemIcon: {
    fontSize: 24,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#CCC',
    marginBottom: 2,
  },
  itemDesc: {
    fontSize: 12,
    color: '#555',
  },
  itemCostBox: {
    alignItems: 'center',
  },
  itemCost: {
    fontSize: 18,
    fontWeight: '800',
    color: '#666',
  },
  itemCostLabel: {
    fontSize: 10,
    color: '#444',
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    marginTop: 24,
    fontStyle: 'italic',
  },
});
