import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../../data/types';
import { SEED_PROFILES } from '../../data/seed-profiles';

/**
 * Stats tab showing the player's detailed performance history and rankings.
 * Displays win/loss record, points balance, win-rate bar, per-game breakdown, and milestone badges.
 * Leaderboard ranks the current user against seed profiles by points.
 * Parameters: none; reads currentUser from global context.
 * Returns: a scrollable stats screen; null when no user is logged in.
 * Edge cases: percentages and rank show 0 / last when no games have been played.
 */
export default function StatsScreen() {
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
    { name: currentUser.displayName ?? currentUser.username, points: currentUser.points, isMe: true },
    ...SEED_PROFILES.map((p) => ({
      name: p.displayName ?? p.username,
      points: p.points,
      isMe: false,
    })),
  ].sort((a, b) => b.points - a.points);

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
            { value: currentUser.points, label: 'Points', color: '#007AFF' },
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

      {/* Rank */}
      <View style={styles.rankCard}>
        <Text style={styles.rankLabel}>LEADERBOARD RANK</Text>
        <Text style={styles.rankNum}>#{myRank}</Text>
        <Text style={styles.rankSub}>out of {allPlayers.length} players</Text>
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
        <Text style={styles.sectionTitle}>Leaderboard — Top 10</Text>
        {allPlayers.slice(0, 10).map((p, idx) => (
          <View key={idx} style={[styles.leaderRow, p.isMe && styles.leaderRowMe]}>
            <Text style={[styles.leaderRank, idx < 3 && styles.leaderRankTop]}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
            </Text>
            <Text style={[styles.leaderName, p.isMe && styles.leaderNameMe]}>
              {p.name}{p.isMe ? ' (You)' : ''}
            </Text>
            <Text style={styles.leaderPts}>{p.points} pts</Text>
          </View>
        ))}
        {myRank > 10 && (
          <View style={[styles.leaderRow, styles.leaderRowMe, { marginTop: 8 }]}>
            <Text style={styles.leaderRank}>#{myRank}</Text>
            <Text style={[styles.leaderName, styles.leaderNameMe]}>
              {currentUser.displayName ?? currentUser.username} (You)
            </Text>
            <Text style={styles.leaderPts}>{currentUser.points} pts</Text>
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
  overviewNum: { fontSize: 26, fontWeight: '900', color: '#FFF' },
  overviewLabel: { fontSize: 11, color: '#888', marginTop: 3, fontWeight: '600' },
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
  rankSub: { fontSize: 13, color: '#7B5FAF', marginTop: 4 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 14,
  },
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
  leaderName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#CCC' },
  leaderNameMe: { color: '#007AFF' },
  leaderPts: { fontSize: 13, fontWeight: '700', color: '#888' },
});
