import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../../data/types';
import { SEED_PROFILES } from '../../data/seed-profiles';

/**
 * Stats tab showing the player's detailed performance history and monthly rankings.
 * Displays win/loss record, all-time points, win-rate bar, per-game breakdown, and milestone badges.
 * Leaderboard ranks players by monthly points, which reset at the start of each calendar month.
 * The current user's seed profile entry is excluded from the leaderboard to prevent duplicates.
 * Parameters: none; reads currentUser from global context.
 * Returns: a scrollable stats screen; null when no user is logged in.
 * Edge cases: percentages and rank show 0 / last when no games have been played; leaderboard rows
 * are tappable to view any player's full profile.
 */
export default function StatsScreen() {
  const router = useRouter();
  const { currentUser } = useApp();

  if (!currentUser) return null;

  const totalGames = currentUser.wins + currentUser.losses;
  const winPct = totalGames === 0 ? 0 : Math.round((currentUser.wins / totalGames) * 100);

  const milestones: { label: string; icon: string; earned: boolean }[] = [
    { label: 'First Win', icon: '🏆', earned: currentUser.wins >= 1 },
    { label: '10 Wins', icon: '⚔️', earned: currentUser.wins >= 10 },
    { label: '25 Wins', icon: '🔥', earned: currentUser.wins >= 25 },
    { label: '50 Wins', icon: '💀', earned: currentUser.wins >= 50 },
    { label: '100 Points', icon: '💎', earned: currentUser.points >= 100 },
    { label: '500 Points', icon: '👑', earned: currentUser.points >= 500 },
    { label: '1K Points', icon: '🌟', earned: currentUser.points >= 1000 },
    { label: 'First Loss', icon: '📖', earned: currentUser.losses >= 1 },
  ];

  const allPlayers = [
    {
      displayName: currentUser.displayName ?? currentUser.username,
      username: currentUser.username,
      monthlyPoints: currentUser.monthlyPoints,
      isMe: true,
    },
    ...SEED_PROFILES
      .filter((p) => p.username !== currentUser.username)
      .map((p) => ({
        displayName: p.displayName ?? p.username,
        username: p.username,
        monthlyPoints: p.monthlyPoints,
        isMe: false,
      })),
  ].sort((a, b) => b.monthlyPoints - a.monthlyPoints);

  const myRank = allPlayers.findIndex((p) => p.isMe) + 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>Your Stats</Text>

      {/* Overview */}
      <View style={styles.overviewCard}>
        <View style={styles.overviewRow}>
          {[
            { value: currentUser.wins, label: 'Wins', color: '#34C759' },
            { value: currentUser.losses, label: 'Losses', color: '#FF3B30' },
            { value: totalGames, label: 'Games', color: '#FFF' },
            { value: currentUser.points, label: 'All-Time Pts', color: '#007AFF' },
          ].map((stat, i, arr) => (
            <View key={stat.label} style={styles.overviewStatWrap}>
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewNum, { color: stat.color }]}>{stat.value}</Text>
                <Text style={styles.overviewLabel}>{stat.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={styles.overviewDivider} />}
            </View>
          ))}
        </View>
        <View style={styles.winRateRow}>
          <Text style={styles.winRateLabel}>Win Rate</Text>
          <Text style={styles.winRateNum}>{winPct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${winPct}%` }]} />
        </View>
      </View>

      {/* Monthly rank */}
      <View style={styles.rankCard}>
        <Text style={styles.rankLabel}>MONTHLY LEADERBOARD RANK</Text>
        <Text style={styles.rankNum}>#{myRank}</Text>
        <Text style={styles.rankSub}>out of {allPlayers.length} players</Text>
        <View style={styles.monthlyPtsBadge}>
          <Text style={styles.monthlyPtsLabel}>THIS MONTH</Text>
          <Text style={styles.monthlyPtsVal}>{currentUser.monthlyPoints} pts</Text>
        </View>
      </View>

      {/* Games */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Games You Play</Text>
        {currentUser.games.map((g) => (
          <View key={g} style={[styles.gameRow, { borderLeftColor: GAME_COLOR[g] }]}>
            <Text style={styles.gameEmoji}>{GAME_EMOJI[g]}</Text>
            <View style={styles.gameInfo}>
              <Text style={styles.gameName}>{GAME_LABELS[g]}</Text>
              <Text style={styles.gameFmts}>
                {(currentUser.preferredFormats[g] ?? []).join(' · ') || 'No formats selected'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Milestones */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Milestones</Text>
        <View style={styles.milestonesGrid}>
          {milestones.map((m) => (
            <View key={m.label} style={[styles.milestone, !m.earned && styles.milestoneLocked]}>
              <Text style={[styles.milestoneIcon, !m.earned && { opacity: 0.35 }]}>
                {m.earned ? m.icon : '🔒'}
              </Text>
              <Text style={[styles.milestoneLabel, !m.earned && styles.milestoneLabelLocked]}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Leaderboard */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Leaderboard — Top 10</Text>
        <Text style={styles.sectionHint}>Ranked by points earned this month · tap to view profile</Text>
        {allPlayers.slice(0, 10).map((p, idx) => (
          <Pressable
            key={p.username}
            style={[styles.leaderRow, p.isMe && styles.leaderRowMe]}
            onPress={() => {
              if (!p.isMe) {
                router.push({ pathname: '/player-profile', params: { username: p.username } });
              }
            }}
          >
            <Text style={[styles.leaderRank, idx < 3 && styles.leaderRankTop]}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
            </Text>
            <View style={styles.leaderNameCol}>
              <Text style={[styles.leaderName, p.isMe && styles.leaderNameMe]}>
                {p.displayName}
              </Text>
              {p.isMe && <Text style={styles.leaderYou}>YOU</Text>}
            </View>
            <Text style={[styles.leaderPts, p.isMe && styles.leaderPtsMe]}>{p.monthlyPoints} pts</Text>
          </Pressable>
        ))}
        {myRank > 10 && (
          <View style={[styles.leaderRow, styles.leaderRowMe, { marginTop: 8 }]}>
            <Text style={styles.leaderRank}>#{myRank}</Text>
            <View style={styles.leaderNameCol}>
              <Text style={[styles.leaderName, styles.leaderNameMe]}>
                {currentUser.displayName ?? currentUser.username}
              </Text>
              <Text style={styles.leaderYou}>YOU</Text>
            </View>
            <Text style={[styles.leaderPts, styles.leaderPtsMe]}>{currentUser.monthlyPoints} pts</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F14' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 32, fontWeight: '900', color: '#FFF', marginBottom: 24 },
  overviewCard: {
    backgroundColor: '#1C1C24', borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#2C2C38',
  },
  overviewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  overviewStatWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewNum: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  overviewLabel: { fontSize: 10, color: '#888', marginTop: 3, fontWeight: '600' },
  overviewDivider: { width: 1, height: 40, backgroundColor: '#2C2C38' },
  winRateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  winRateLabel: { fontSize: 12, color: '#888', fontWeight: '700' },
  winRateNum: { fontSize: 12, color: '#34C759', fontWeight: '700' },
  progressTrack: { height: 6, backgroundColor: '#2C2C38', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#34C759', borderRadius: 3 },
  rankCard: {
    backgroundColor: '#1A0A2A', borderRadius: 18, padding: 20, marginBottom: 24,
    borderWidth: 1.5, borderColor: '#7B4FBF', alignItems: 'center',
  },
  rankLabel: { fontSize: 11, fontWeight: '700', color: '#8B6FBF', letterSpacing: 1.5, marginBottom: 6 },
  rankNum: { fontSize: 52, fontWeight: '900', color: '#A07FDF', lineHeight: 58 },
  rankSub: { fontSize: 13, color: '#7B5FAF', marginTop: 4, marginBottom: 12 },
  monthlyPtsBadge: {
    backgroundColor: '#2A1A3A', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#5B3FCF',
  },
  monthlyPtsLabel: { fontSize: 9, fontWeight: '800', color: '#8B6FBF', letterSpacing: 1.5, marginBottom: 2 },
  monthlyPtsVal: { fontSize: 22, fontWeight: '900', color: '#C0A0FF' },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 6,
  },
  sectionHint: { fontSize: 11, color: '#555', marginBottom: 12 },
  gameRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C24',
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1,
    borderColor: '#2C2C38', borderLeftWidth: 4,
  },
  gameEmoji: { fontSize: 24, marginRight: 14 },
  gameInfo: { flex: 1 },
  gameName: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  gameFmts: { fontSize: 12, color: '#888' },
  milestonesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  milestone: {
    width: '22%', backgroundColor: '#1C1C24', borderRadius: 14, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#34C759',
  },
  milestoneLocked: { borderColor: '#2C2C38', opacity: 0.45 },
  milestoneIcon: { fontSize: 28, marginBottom: 6 },
  milestoneLabel: { fontSize: 9, fontWeight: '700', color: '#CCC', textAlign: 'center', lineHeight: 13 },
  milestoneLabelLocked: { color: '#666' },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C24',
    borderRadius: 12, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: '#2C2C38',
  },
  leaderRowMe: { backgroundColor: '#0A1A2A', borderColor: '#007AFF' },
  leaderRank: { width: 40, fontSize: 14, fontWeight: '700', color: '#888' },
  leaderRankTop: { fontSize: 22 },
  leaderNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaderName: { fontSize: 14, fontWeight: '700', color: '#CCC' },
  leaderNameMe: { color: '#007AFF' },
  leaderYou: { fontSize: 9, fontWeight: '800', color: '#007AFF', backgroundColor: '#001830', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  leaderPts: { fontSize: 13, fontWeight: '700', color: '#888' },
  leaderPtsMe: { color: '#007AFF' },
});
