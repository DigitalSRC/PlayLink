import { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS, GameType, UserProfile } from '../../data/types';
import { useThemeColors } from '../../utils/theme-utils';
import { fetchLeaderboard } from '../../lib/profile-api';

const PAGE_WIDTH = Dimensions.get('window').width - 40;

interface LeaderRow {
  id: string;
  displayName: string;
  username: string;
  monthlyPoints: number;
  wins: number;
  losses: number;
  draws: number;
  isMe: boolean;
}

/**
 * Builds the current user's own leaderboard row for a single game.
 * Kept separate from the fetched pool so the row always reflects the live currentUser object
 * (React Query cache for other players may be a few seconds stale, which is fine for them but
 * would feel wrong for the user's own numbers on their own stats screen).
 * Parameters: user (the current user's UserProfile).
 * Returns: a LeaderRow with isMe: true.
 * Edge cases: none — every signed-in user has wins/losses/draws/monthlyPoints defined.
 */
const buildSelfRow = (user: UserProfile): LeaderRow => ({
  id: user.id,
  displayName: user.displayName ?? user.username,
  username: user.username,
  monthlyPoints: user.monthlyPoints,
  wins: user.wins,
  losses: user.losses,
  draws: user.draws,
  isMe: true,
});

/**
 * Stats tab showing the player's detailed performance history and per-game monthly rankings.
 * Displays win/loss record, all-time points, win-rate bar, per-game breakdown, and milestone
 * badges, plus one swipeable leaderboard page per game the player plays — each page only shows
 * players who share that specific game, since a Pokemon ranking full of Magic players (or vice
 * versa) wouldn't mean anything.
 * Parameters: none; reads currentUser from global context.
 * Returns: a scrollable stats screen; null when no user is logged in.
 * Edge cases: a user with no games selected sees no leaderboard pages (just their overview and
 * milestones); each page's rank/leaderboard loads independently, so a slow network only blanks
 * the page being viewed rather than the whole screen.
 */
export default function StatsScreen() {
  const router = useRouter();
  const { currentUser } = useApp();
  const colors = useThemeColors();
  const scrollRef = useRef<ScrollView>(null);
  const [activeGameIndex, setActiveGameIndex] = useState(0);

  const games: GameType[] = currentUser?.games ?? [];

  const leaderboardQueries = useQueries({
    queries: games.map((game) => ({
      queryKey: ['leaderboard', game, currentUser?.id],
      queryFn: () => fetchLeaderboard(game, currentUser!.id),
      enabled: !!currentUser,
    })),
  });

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

  const selfRow: LeaderRow = buildSelfRow(currentUser);

  const scrollToGame = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * PAGE_WIDTH, animated: true });
    setActiveGameIndex(index);
  };

  const onPageScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / PAGE_WIDTH);
    setActiveGameIndex(index);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Your Stats</Text>

      {/* Overview */}
      <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.overviewRow}>
          {[
            { value: currentUser.wins, label: 'Wins', color: '#34C759' },
            { value: currentUser.losses, label: 'Losses', color: '#FF3B30' },
            { value: currentUser.draws, label: 'Draws', color: '#E6A817' },
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

      {/* Per-game leaderboards */}
      {games.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Monthly Leaderboard</Text>
          <View style={styles.gameTabRow}>
            {games.map((g, i) => (
              <Pressable
                key={g}
                style={[
                  styles.gameTab,
                  { borderColor: colors.border },
                  i === activeGameIndex && [styles.gameTabActive, { borderColor: GAME_COLOR[g] }],
                ]}
                onPress={() => scrollToGame(i)}
              >
                <Text style={styles.gameTabEmoji}>{GAME_EMOJI[g]}</Text>
                <Text style={[styles.gameTabLabel, { color: i === activeGameIndex ? colors.textPrimary : colors.textSecondary }]}>
                  {GAME_LABELS[g]}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPageScrollEnd}
          >
            {games.map((g, i) => {
              const others = (leaderboardQueries[i]?.data ?? []).map((p): LeaderRow => ({
                id: p.id,
                displayName: p.displayName ?? p.username,
                username: p.username,
                monthlyPoints: p.monthlyPoints,
                wins: p.wins,
                losses: p.losses,
                draws: p.draws,
                isMe: false,
              }));
              const rows = [selfRow, ...others].sort((a, b) => b.monthlyPoints - a.monthlyPoints);
              const myRank = rows.findIndex((r) => r.isMe) + 1;
              const isLoading = leaderboardQueries[i]?.isLoading;

              return (
                <View key={g} style={{ width: PAGE_WIDTH }}>
                  <View style={styles.rankCard}>
                    <Text style={styles.rankLabel}>{GAME_LABELS[g].toUpperCase()} RANK</Text>
                    <Text style={styles.rankNum}>#{myRank}</Text>
                    <Text style={styles.rankSub}>out of {rows.length} players</Text>
                    <View style={styles.monthlyPtsBadge}>
                      <Text style={styles.monthlyPtsLabel}>THIS MONTH</Text>
                      <Text style={styles.monthlyPtsVal}>{currentUser.monthlyPoints} pts</Text>
                    </View>
                  </View>

                  {isLoading && (
                    <Text style={[styles.sectionHint, { color: colors.textMuted }]}>Loading rankings…</Text>
                  )}

                  {rows.slice(0, 10).map((p, idx) => (
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
                        <Text style={[styles.leaderRecord, { color: colors.textMuted }]}>{p.wins}-{p.losses}-{p.draws}</Text>
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
                        <Text style={[styles.leaderRecord, { color: colors.textMuted }]}>
                          {currentUser.wins}-{currentUser.losses}-{currentUser.draws}
                        </Text>
                      </View>
                      <Text style={[styles.leaderPts, styles.leaderPtsMe]}>{currentUser.monthlyPoints} pts</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}
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
    backgroundColor: '#1A0A2A', borderRadius: 18, padding: 20, marginBottom: 16,
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
  gameTabRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  gameTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1,
  },
  gameTabActive: { borderWidth: 2 },
  gameTabEmoji: { fontSize: 14 },
  gameTabLabel: { fontSize: 12, fontWeight: '700' },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, padding: 14, marginBottom: 6, borderWidth: 1,
  },
  leaderRowMe: { backgroundColor: '#0A1A2A', borderColor: '#007AFF' },
  leaderRank: { width: 40, fontSize: 14, fontWeight: '700' },
  leaderRankTop: { fontSize: 22 },
  leaderNameCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  leaderName: { fontSize: 14, fontWeight: '700' },
  leaderNameMe: { color: '#007AFF' },
  leaderYou: { fontSize: 9, fontWeight: '800', color: '#007AFF', backgroundColor: '#001830', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  leaderRecord: { fontSize: 10, fontWeight: '600' },
  leaderPts: { fontSize: 13, fontWeight: '700' },
  leaderPtsMe: { color: '#007AFF' },
});
