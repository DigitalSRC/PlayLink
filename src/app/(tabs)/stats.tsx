import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../../data/types';
import { SEED_PROFILES } from '../../data/seed-profiles';
import { useThemeColors } from '../../utils/theme-utils';

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
  const colors = useThemeColors();

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
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Your Stats</Text>

      {/* Overview */}
      <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.overviewRow}>
          {[
            { value: currentUser.wins, label: 'Wins', color: '#34C759' },
            { value: currentUser.losses, label: 'Losses', color: '#FF3B30' },
            { value: totalGames, label: 'Games', color: colors.textPrimary },
            { value: currentUser.points, label: 'All-Time Pts', color: '#007AFF' },
          ].map((stat, i, arr) => (
            <View key={stat.label} style={styles.overviewStatWrap}>
              <View style={styles.overviewStat}>
                <Text style={[styles.overviewNum, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />}
            </View>
          ))}
        </View>
        <View style={styles.winRateRow}>
          <Text style={[styles.winRateLabel, { color: colors.textSecondary }]}>Win Rate</Text>
          <Text style={styles.winRateNum}>{winPct}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
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
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Games You Play</Text>
        {currentUser.games.map((g) => (
          <View key={g} style={[styles.gameRow, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: GAME_COLOR[g] }]}>
            <Text style={styles.gameEmoji}>{GAME_EMOJI[g]}</Text>
            <View style={styles.gameInfo}>
              <Text style={[styles.gameName, { color: colors.textPrimary }]}>{GAME_LABELS[g]}</Text>
              <Text style={[styles.gameFmts, { color: colors.textSecondary }]}>
                {(currentUser.preferredFormats[g] ?? []).join(' · ') || 'No formats selected'}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Milestones */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Milestones</Text>
        <View style={styles.milestonesGrid}>
          {milestones.map((m) => (
            <View key={m.label} style={[styles.milestone, { backgroundColor: colors.card }, !m.earned && [styles.milestoneLocked, { borderColor: colors.border }]]}>
              <Text style={[styles.milestoneIcon, !m.earned && { opacity: 0.35 }]}>
                {m.earned ? m.icon : '🔒'}
              </Text>
              <Text style={[styles.milestoneLabel, { color: colors.textSecondary }, !m.earned && styles.milestoneLabelLocked]}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Leaderboard */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Monthly Leaderboard — Top 10</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Ranked by points earned this month · tap to view profile</Text>
        {allPlayers.slice(0, 10).map((p, idx) => (
          <Pressable
            key={p.username}
            style={[styles.leaderRow, { backgroundColor: colors.card, borderColor: colors.border }, p.isMe && styles.leaderRowMe]}
            onPress={() => {
              if (!p.isMe) {
                router.push({ pathname: '/player-profile', params: { username: p.username } });
              }
            }}
          >
            <Text style={[styles.leaderRank, { color: colors.textSecondary }, idx < 3 && styles.leaderRankTop]}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
            </Text>
            <View style={styles.leaderNameCol}>
              <Text style={[styles.leaderName, { color: colors.textSecondary }, p.isMe && styles.leaderNameMe]}>
                {p.displayName}
              </Text>
              {p.isMe && <Text style={styles.leaderYou}>YOU</Text>}
            </View>
            <Text style={[styles.leaderPts, { color: colors.textSecondary }, p.isMe && styles.leaderPtsMe]}>{p.monthlyPoints} pts</Text>
          </Pressable>
        ))}
        {myRank > 10 && (
          <View style={[styles.leaderRow, { backgroundColor: colors.card, borderColor: colors.border }, styles.leaderRowMe, { marginTop: 8 }]}>
            <Text style={[styles.leaderRank, { color: colors.textSecondary }]}>#{myRank}</Text>
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
  container: { flex: 1 },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 50 },
  screenTitle: { fontSize: 32, fontWeight: '900', marginBottom: 24 },
  overviewCard: {
    borderRadius: 18, padding: 18,
    marginBottom: 16, borderWidth: 1,
  },
  overviewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  overviewStatWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewNum: { fontSize: 24, fontWeight: '900' },
  overviewLabel: { fontSize: 10, marginTop: 3, fontWeight: '600' },
  overviewDivider: { width: 1, height: 40 },
  winRateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  winRateLabel: { fontSize: 12, fontWeight: '700' },
  winRateNum: { fontSize: 12, color: '#34C759', fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
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
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 6,
  },
  sectionHint: { fontSize: 11, marginBottom: 12 },
  gameRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1,
    borderLeftWidth: 4,
  },
  gameEmoji: { fontSize: 24, marginRight: 14 },
  gameInfo: { flex: 1 },
  gameName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  gameFmts: { fontSize: 12 },
  milestonesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  milestone: {
    width: '22%', borderRadius: 14, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#34C759',
  },
  milestoneLocked: { opacity: 0.45 },
  milestoneIcon: { fontSize: 28, marginBottom: 6 },
  milestoneLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
  milestoneLabelLocked: { color: '#666' },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginBottom: 6, borderWidth: 1,
  },
  leaderRowMe: { backgroundColor: '#0A1A2A', borderColor: '#007AFF' },
  leaderRank: { width: 40, fontSize: 14, fontWeight: '700' },
  leaderRankTop: { fontSize: 22 },
  leaderNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  leaderName: { fontSize: 14, fontWeight: '700' },
  leaderNameMe: { color: '#007AFF' },
  leaderYou: { fontSize: 9, fontWeight: '800', color: '#007AFF', backgroundColor: '#001830', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  leaderPts: { fontSize: 13, fontWeight: '700' },
  leaderPtsMe: { color: '#007AFF' },
});
