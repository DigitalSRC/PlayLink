import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Developer tools screen accessible only to users with isDeveloper set on their profile.
 * Allows simulating time advancement (shifting the app's perceived current date up to 14 days forward),
 * awarding or removing points for testing the points system, and resetting the date override.
 * All changes are in-memory and reset when the app restarts.
 * Parameters: none; reads and writes devDateOffset, currentUser, and awardPoints from global context.
 * Returns: a scrollable dev tools panel; navigates back if the current user is not a developer.
 * Edge cases: non-developer users are immediately redirected; date offset is clamped to [0, 14] days.
 */
export default function DevTools() {
  const router = useRouter();
  const { currentUser, devDateOffset, setDevDateOffset, awardPoints, addWin, addLoss, addDraw, resetMonthlyPoints, getNow } = useApp();

  if (!currentUser?.isDeveloper) {
    router.back();
    return null;
  }

  const offsetDays = Math.round(devDateOffset / MS_PER_DAY);
  const simulatedDate = new Date(getNow());

  const shiftDays = (delta: number) => {
    const next = Math.max(0, Math.min(14, offsetDays + delta));
    Haptics.selectionAsync();
    setDevDateOffset(next * MS_PER_DAY);
  };

  const resetDate = () => {
    Haptics.selectionAsync();
    setDevDateOffset(0);
  };

  const grantPoints = (amount: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    awardPoints(amount);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.badge}>🔧 DEVELOPER</Text>
        <Text style={styles.title}>Dev Tools</Text>
        <Text style={styles.subtitle}>Testing utilities — changes are in-memory only</Text>
      </View>

      {/* Date simulation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>DATE SIMULATION</Text>
        <Text style={styles.dateDisplay}>
          {simulatedDate.toDateString()}
        </Text>
        {offsetDays > 0 && (
          <Text style={styles.offsetBadge}>+{offsetDays} day{offsetDays !== 1 ? 's' : ''} from today</Text>
        )}

        <View style={styles.dayRow}>
          {[-7, -1, +1, +7].map((d) => (
            <Pressable key={d} style={styles.dayBtn} onPress={() => shiftDays(d)}>
              <Text style={styles.dayBtnText}>{d > 0 ? `+${d}d` : `${d}d`}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.presetRow}>
          {[0, 1, 3, 7, 14].map((d) => (
            <Pressable
              key={d}
              style={[styles.presetBtn, offsetDays === d && styles.presetBtnActive]}
              onPress={() => { Haptics.selectionAsync(); setDevDateOffset(d * MS_PER_DAY); }}
            >
              <Text style={[styles.presetBtnText, offsetDays === d && styles.presetBtnTextActive]}>
                {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `+${d}d`}
              </Text>
            </Pressable>
          ))}
        </View>

        {offsetDays > 0 && (
          <Pressable style={styles.resetDateBtn} onPress={resetDate}>
            <Text style={styles.resetDateBtnText}>Reset to Today</Text>
          </Pressable>
        )}
      </View>

      {/* Points testing */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>POINTS TESTING</Text>
        <Text style={styles.currentPts}>Current: {currentUser.points} pts</Text>
        <View style={styles.ptsRow}>
          {[10, 30, 100, 500].map((amt) => (
            <Pressable key={amt} style={styles.ptsBtn} onPress={() => grantPoints(amt)}>
              <Text style={styles.ptsBtnText}>+{amt}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.ptsRow}>
          {[-10, -30, -100].map((amt) => (
            <Pressable key={amt} style={[styles.ptsBtn, styles.ptsBtnMinus]} onPress={() => grantPoints(amt)}>
              <Text style={[styles.ptsBtnText, styles.ptsBtnTextMinus]}>{amt}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.ptsBtn, styles.ptsBtnDanger]}
            onPress={() => Alert.alert('Reset Points', 'Set points to 0?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => grantPoints(-currentUser.points) },
            ])}
          >
            <Text style={[styles.ptsBtnText, styles.ptsBtnTextDanger]}>Reset</Text>
          </Pressable>
        </View>
      </View>

      {/* Game results simulation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>SIMULATE GAME RESULTS</Text>
        <Text style={styles.simInfo}>
          W/L: {currentUser.wins}/{currentUser.losses}
          {'  ·  '}Monthly: {currentUser.monthlyPoints} pts
        </Text>
        <View style={styles.simRow}>
          <Pressable
            style={[styles.simBtn, styles.simBtnWin]}
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); addWin(); }}
          >
            <Text style={styles.simBtnIcon}>🏆</Text>
            <Text style={[styles.simBtnText, styles.simBtnTextWin]}>Win</Text>
            <Text style={styles.simBtnSub}>+30 pts</Text>
          </Pressable>
          <Pressable
            style={[styles.simBtn, styles.simBtnLoss]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); addLoss(); }}
          >
            <Text style={styles.simBtnIcon}>💀</Text>
            <Text style={[styles.simBtnText, styles.simBtnTextLoss]}>Loss</Text>
            <Text style={styles.simBtnSub}>+0 pts</Text>
          </Pressable>
          <Pressable
            style={[styles.simBtn, styles.simBtnDraw]}
            onPress={() => { Haptics.selectionAsync(); addDraw(); }}
          >
            <Text style={styles.simBtnIcon}>🤝</Text>
            <Text style={[styles.simBtnText, styles.simBtnTextDraw]}>Draw</Text>
            <Text style={styles.simBtnSub}>+10 pts</Text>
          </Pressable>
        </View>
      </View>

      {/* Monthly leaderboard reset */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>MONTHLY LEADERBOARD</Text>
        <Text style={styles.simInfo}>Current monthly pts: {currentUser.monthlyPoints}</Text>
        <Pressable
          style={styles.resetMonthBtn}
          onPress={() => Alert.alert(
            'Reset Monthly Leaderboard',
            'This simulates the monthly reset — your monthly points go to 0. All-time points are unchanged.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset Month', style: 'destructive', onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); resetMonthlyPoints(); } },
            ]
          )}
        >
          <Text style={styles.resetMonthBtnText}>🗓 Simulate Monthly Reset</Text>
        </Pressable>
      </View>

      {/* Profile info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>CURRENT SESSION</Text>
        <Text style={styles.infoRow}>Username: {currentUser.username}</Text>
        {currentUser.displayName && (
          <Text style={styles.infoRow}>Display: {currentUser.displayName}</Text>
        )}
        <Text style={styles.infoRow}>Location: {currentUser.location}</Text>
        <Text style={styles.infoRow}>W/L: {currentUser.wins}/{currentUser.losses}</Text>
        <Text style={styles.infoRow}>Points: {currentUser.points}</Text>
        <Text style={[styles.infoRow, styles.devBadge]}>⚡ Developer Account</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  content: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 50 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  header: { marginBottom: 24 },
  badge: {
    fontSize: 11, fontWeight: '800', color: '#34C759', letterSpacing: 1.5,
    backgroundColor: '#0A2A0A', borderRadius: 6, paddingHorizontal: 10,
    paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8,
  },
  title: { fontSize: 30, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#888' },
  card: {
    backgroundColor: '#111118', borderRadius: 16, padding: 18,
    marginBottom: 18, borderWidth: 1, borderColor: '#1C1C28',
  },
  cardTitle: {
    fontSize: 10, fontWeight: '800', color: '#555', letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 14,
  },
  dateDisplay: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  offsetBadge: {
    fontSize: 12, color: '#E6A817', fontWeight: '700',
    backgroundColor: '#2A1F00', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 14,
  },
  dayRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dayBtn: {
    flex: 1, backgroundColor: '#1C1C28', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2C2C3C',
  },
  dayBtnText: { fontSize: 14, fontWeight: '700', color: '#CCC' },
  presetRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  presetBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#1C1C28', borderWidth: 1, borderColor: '#2C2C3C',
  },
  presetBtnActive: { backgroundColor: '#0A2A40', borderColor: '#007AFF' },
  presetBtnText: { fontSize: 13, fontWeight: '600', color: '#888' },
  presetBtnTextActive: { color: '#007AFF' },
  resetDateBtn: {
    marginTop: 12, backgroundColor: '#1A1000', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#5A4000',
  },
  resetDateBtnText: { fontSize: 13, fontWeight: '700', color: '#E6A817' },
  currentPts: { fontSize: 20, fontWeight: '800', color: '#007AFF', marginBottom: 14 },
  ptsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ptsBtn: {
    flex: 1, backgroundColor: '#0A2A0A', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1A4A1A',
  },
  ptsBtnText: { fontSize: 14, fontWeight: '700', color: '#34C759' },
  ptsBtnMinus: { backgroundColor: '#2A0A0A', borderColor: '#4A1A1A' },
  ptsBtnTextMinus: { color: '#FF6B6B' },
  ptsBtnDanger: { backgroundColor: '#2A0A0A', borderColor: '#8B1A1A' },
  ptsBtnTextDanger: { color: '#FF3B30' },
  infoRow: { fontSize: 13, color: '#888', marginBottom: 6 },
  devBadge: { color: '#34C759', fontWeight: '700', marginTop: 4 },

  /* Game sim */
  simInfo: { fontSize: 13, color: '#888', marginBottom: 14, fontWeight: '600' },
  simRow: { flexDirection: 'row', gap: 8 },
  simBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    borderWidth: 1.5, gap: 4,
  },
  simBtnWin: { backgroundColor: '#0A2A0A', borderColor: '#34C759' },
  simBtnLoss: { backgroundColor: '#2A0A0A', borderColor: '#FF3B30' },
  simBtnDraw: { backgroundColor: '#1A1A0A', borderColor: '#E6A817' },
  simBtnIcon: { fontSize: 22 },
  simBtnText: { fontSize: 15, fontWeight: '800' },
  simBtnTextWin: { color: '#34C759' },
  simBtnTextLoss: { color: '#FF3B30' },
  simBtnTextDraw: { color: '#E6A817' },
  simBtnSub: { fontSize: 10, color: '#666', fontWeight: '600' },

  /* Monthly reset */
  resetMonthBtn: {
    backgroundColor: '#1A0A20', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#7B4FBF',
  },
  resetMonthBtnText: { fontSize: 14, fontWeight: '700', color: '#A07FDF' },
});
