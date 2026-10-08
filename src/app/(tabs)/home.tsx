import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import HowItWorksSheet from '../../components/HowItWorksSheet';
import PlayerName from '../../components/PlayerName';
import { chosenRivalStorageKey, useApp } from '../../context/AppContext';
import { STARTER_REWARD_POINTS, STARTER_REWARDS, StarterRewardKey } from '../../data/rewards';
import { useClaimStarterReward, useStarterRewardsQuery } from '../../hooks/useRewardQueries';
import { COMMANDER_ONLY, GAME_COLOR, GAME_EMOJI, GAME_LABELS, visibleGames } from '../../data/types';
import { findGroupsForPlayer } from '../../utils/group-utils';
import { useThemeColors } from '../../utils/theme-utils';

// Remembers, per account on this device, that the welcome guide has been shown once.
const welcomeSeenStorageKey = (userId: string) => `welcome-seen:${userId}`;

/**
 * Home tab — the player's personal dashboard after logging in.
 * Shows the player's spendable Points (a button into the Shop), win/loss record, active group, and rival hierarchy.
 * Their own name is drawn the way they've dressed it in the Shop (name color and title).
 * Rival section distinguishes between one chosen Rival (red), up to two Contenders (gold), and an optional Familiar Foe slot for the most-played-against player.
 * A Pickup Game button launches an ad-hoc life counter session without creating a formal group.
 * Lists every group the player is in, soonest first (they can hold one per day), with Find and Create always underneath.
 * Parameters: none; reads currentUser, groups, rivals, chosenRivalId, and mostPlayedAgainst from global context.
 * Returns: a scrollable dashboard screen with a Pickup Game card and quick-action buttons for Find and Create Group.
 * Edge cases: shows "No Active Group" above the Find and Create buttons when the user is in no group; hides the rivals section entirely when the rivals array is empty;
 * a player with no recorded games yet is greeted with "Welcome,". The "How PlayLink works" button opens the guide at any time, and the guide
 * opens by itself once, with a welcome, the first time a new player arrives from onboarding. The "Getting started" card lists the four
 * one-time starter rewards and ticks them off; it is hidden once all four are claimed, and whenever the server has no starter rewards.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { currentUser, groups, rivals, chosenRivalId, mostPlayedAgainst } = useApp();
  const colors = useThemeColors();
  const userId = currentUser?.id;
  const rewardsQuery = useStarterRewardsQuery(userId);
  const claimReward = useClaimStarterReward(userId);
  const [showGuide, setShowGuide] = useState(false);
  const [welcome, setWelcome] = useState(false);

  // Nothing on record yet: this is someone still finding their way around.
  const isNewPlayer =
    !!currentUser &&
    currentUser.wins + currentUser.losses + currentUser.draws === 0 &&
    currentUser.points === 0;

  // The last step of onboarding: the first time a brand-new player lands here, the guide opens
  // by itself with a welcome on top. Once per account on this device; an account that already
  // has games on record is marked as having seen it without being shown anything.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    AsyncStorage.getItem(welcomeSeenStorageKey(userId))
      .then((seen) => {
        if (cancelled || seen) return;
        AsyncStorage.setItem(welcomeSeenStorageKey(userId), '1').catch(() => {});
        if (isNewPlayer) {
          setWelcome(true);
          setShowGuide(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!currentUser) return null;

  // Undefined data means the server has no starter rewards (or hasn't answered): show none.
  const rewardsAvailable = rewardsQuery.data !== undefined;
  const claimedRewards = rewardsQuery.data ?? [];

  /**
   * Closes the guide. When it was the welcome shown at the end of onboarding, this is also the
   * moment to pay the "pick your Rival" reward to a player who picked one during sign-up: the
   * pick was saved on the device then, and asking now keeps the points pop-up from opening on
   * top of the guide.
   * Parameters: none.
   * Returns: void.
   * Edge cases: a player who skipped the rival step has no saved pick and nothing is claimed; a
   * failed read of the saved pick is ignored, and the reward can still be earned from the
   * Profile tab.
   */
  const closeGuide = () => {
    setShowGuide(false);
    if (!welcome) return;
    setWelcome(false);
    AsyncStorage.getItem(chosenRivalStorageKey(currentUser.id))
      .then((picked) => {
        if (picked) claimReward('choose_rival');
      })
      .catch(() => {});
  };

  const openReward = (key: StarterRewardKey) => {
    if (key === 'view_calendar') router.push('/(tabs)/calendar');
    else if (key === 'create_group') router.push({ pathname: '/(tabs)/browse', params: { openCreate: '1' } });
    else if (key === 'join_group') router.push('/(tabs)/browse');
    else router.push('/(tabs)/profile');
  };

  // A player can hold one group per day, so there may be several; soonest first.
  const myGroups = findGroupsForPlayer(groups, currentUser.id);

  const totalGames = currentUser.wins + currentUser.losses;
  const winPct = totalGames === 0 ? 0 : Math.round((currentUser.wins / totalGames) * 100);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>{isNewPlayer ? 'Welcome,' : 'Welcome back,'}</Text>
          <PlayerName
            name={currentUser.displayName ?? currentUser.username}
            cosmetics={{ title: currentUser.title, nameColor: currentUser.nameColor }}
            style={[styles.username, { color: colors.textPrimary }]}
          />
          <Text style={[styles.location, { color: colors.textSecondary }]}>{currentUser.location}</Text>
        </View>
        <Pressable
          style={[styles.xpBadge, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push('/(tabs)/shop')}
          accessibilityRole="button"
          accessibilityLabel={`${currentUser.pointBalance} points. Open the shop`}
        >
          <Text style={styles.xpLabel}>POINTS</Text>
          <Text style={[styles.xpValue, { color: colors.textPrimary }]}>{currentUser.pointBalance}</Text>
          <Text style={styles.xpShop}>Shop →</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.guideButton, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => { setWelcome(false); setShowGuide(true); }}
        accessibilityRole="button"
      >
        <Text style={[styles.guideButtonText, { color: colors.accentText }]}>How PlayLink works</Text>
        <Text style={[styles.guideButtonArrow, { color: colors.textMuted }]}>→</Text>
      </Pressable>

      {rewardsAvailable && claimedRewards.length < STARTER_REWARDS.length && (
        <View style={[styles.howItWorksCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.howItWorksTitle, { color: colors.textPrimary }]}>Getting started</Text>
          <Text style={[styles.rewardIntro, { color: colors.textSecondary }]}>
            Earn {STARTER_REWARD_POINTS} points for each of these, once.
          </Text>
          {STARTER_REWARDS.map((reward) => {
            const done = claimedRewards.includes(reward.key);
            return (
              <Pressable
                key={reward.key}
                style={[styles.rewardRow, { borderTopColor: colors.border }]}
                onPress={() => openReward(reward.key)}
                disabled={done}
                accessibilityRole="button"
                accessibilityLabel={`${reward.label}. ${done ? 'Done' : `Earn ${STARTER_REWARD_POINTS} points`}`}
              >
                <Text style={[styles.rewardCheck, { color: done ? colors.successText : colors.textMuted }]}>{done ? '✓' : '○'}</Text>
                <View style={styles.rewardText}>
                  <Text style={[styles.rewardLabel, { color: done ? colors.textMuted : colors.textPrimary }]}>{reward.label}</Text>
                  {!done && (
                    <Text style={[styles.rewardHint, { color: colors.textSecondary }]}>
                      {reward.key === 'choose_rival' && rivals.length === 0
                        ? 'Rivals appear once another player shares your game.'
                        : reward.hint}
                    </Text>
                  )}
                </View>
                <Text style={[styles.rewardPoints, { color: done ? colors.successText : colors.accentText }]}>
                  {done ? 'Done' : `+${STARTER_REWARD_POINTS}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Record card */}
      <View style={[styles.recordCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={[styles.recordNum, { color: colors.textPrimary }]}>{currentUser.wins}</Text>
            <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>Wins</Text>
          </View>
          <View style={[styles.recordDivider, { backgroundColor: colors.border }]} />
          <View style={styles.recordStat}>
            <Text style={[styles.recordNum, { color: colors.textPrimary }]}>{currentUser.losses}</Text>
            <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>Losses</Text>
          </View>
          <View style={[styles.recordDivider, { backgroundColor: colors.border }]} />
          <View style={styles.recordStat}>
            <Text style={[styles.recordNum, { color: colors.textPrimary }]}>{winPct}%</Text>
            <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>Win Rate</Text>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${winPct}%` }]} />
        </View>
      </View>

      {/* Games played: hidden while the app is Commander-only, since there is only the one */}
      {!COMMANDER_ONLY && <View style={styles.gamesRow}>
        {currentUser.games.map((g) => (
          <View key={g} style={[styles.gamePill, { backgroundColor: colors.card, borderColor: GAME_COLOR[g] }]}>
            <Text style={[styles.gamePillText, { color: colors.textSecondary }]}>
              {GAME_EMOJI[g]} {GAME_LABELS[g]}
            </Text>
          </View>
        ))}
      </View>}

      {/* Active group */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {myGroups.length === 0 ? 'No Active Group' : myGroups.length === 1 ? 'Your Group' : 'Your Groups'}
        </Text>
        {myGroups.map((group) => (
          <Pressable
            key={group.id}
            style={[styles.activeGroupCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: GAME_COLOR[group.gameType] }]}
            onPress={() => router.push({ pathname: '/group-detail', params: { id: group.id } })}
          >
            <Text style={[styles.activeGroupGame, { color: colors.textSecondary }]}>
              {GAME_EMOJI[group.gameType]} {group.format}
            </Text>
            <Text style={[styles.activeGroupName, { color: colors.textPrimary }]}>{group.name}</Text>
            <Text style={[styles.activeGroupMeta, { color: colors.textSecondary }]}>
              {group.players.length}/{group.targetPlayers} players · {group.location}
            </Text>
            <Text style={styles.activeGroupTime}>{group.time}</Text>
          </Pressable>
        ))}
        {myGroups.length > 0 && (
          <Text style={[styles.groupsHint, { color: colors.textMuted }]}>One group per day - add another for a different day.</Text>
        )}
          <View style={styles.groupActionRow}>
            <Pressable style={[styles.groupActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/(tabs)/browse')}>
              <Text style={styles.groupActionEmoji}>🔍</Text>
              <Text style={[styles.groupActionLabel, { color: colors.textSecondary }]}>Find a Group</Text>
            </Pressable>
            <Pressable
              style={[styles.groupActionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: '/(tabs)/browse', params: { openCreate: '1' } })}
            >
              <Text style={styles.groupActionEmoji}>➕</Text>
              <Text style={[styles.groupActionLabel, { color: colors.textSecondary }]}>Create Group</Text>
            </Pressable>
          </View>
      </View>

      {/* Rivals */}
      {rivals.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Your Rival</Text>

          {/* Chosen rival */}
          {rivals.filter((r) => r.id === chosenRivalId).map((rival) => (
            <Pressable key={rival.id} style={[styles.rivalCard, { backgroundColor: colors.rivalMainBg }, styles.rivalCardMain]} onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}>
              <View style={[styles.rivalAvatar, styles.rivalAvatarMain]}>
                <Text style={styles.rivalInitial}>{rival.username.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.rivalInfo}>
                <Text style={[styles.rivalName, { color: colors.textPrimary }]}>{rival.displayName ?? rival.username}</Text>
                <Text style={[styles.rivalMeta, { color: colors.textSecondary }]}>
                  {rival.wins}W – {rival.losses}L · {visibleGames(rival.games).map((g) => GAME_EMOJI[g]).join(' ')}
                </Text>
              </View>
              <View style={styles.rivalBadge}>
                <Text style={styles.rivalBadgeText}>RIVAL</Text>
              </View>
            </Pressable>
          ))}

          {/* Contenders */}
          {rivals.filter((r) => r.id !== chosenRivalId).length > 0 && (
            <>
              <Text style={[styles.contendersLabel, { color: colors.textSecondary }]}>CONTENDERS</Text>
              {rivals.filter((r) => r.id !== chosenRivalId).map((rival) => (
                <Pressable key={rival.id} style={[styles.rivalCard, { backgroundColor: colors.card, borderColor: colors.border }, styles.rivalCardContender]} onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}>
                  <View style={[styles.rivalAvatar, styles.rivalAvatarContender]}>
                    <Text style={styles.rivalInitial}>{rival.username.charAt(0) || '?'}</Text>
                  </View>
                  <View style={styles.rivalInfo}>
                    <Text style={[styles.rivalName, { color: colors.textPrimary }]}>{rival.displayName ?? rival.username}</Text>
                    <Text style={[styles.rivalMeta, { color: colors.textSecondary }]}>
                      {rival.wins}W – {rival.losses}L · {visibleGames(rival.games).map((g) => GAME_EMOJI[g]).join(' ')}
                    </Text>
                  </View>
                  <View style={[styles.rivalBadge, styles.contenderBadge]}>
                    <Text style={[styles.rivalBadgeText, styles.contenderBadgeText]}>CONTENDER</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Familiar Foe — most played against (exception, shown only when set) */}
          {mostPlayedAgainst && !rivals.some((r) => r.id === mostPlayedAgainst.id) && (
            <>
              <Text style={[styles.contendersLabel, { color: colors.textSecondary }]}>FAMILIAR FOE</Text>
              <View style={[styles.rivalCard, { backgroundColor: colors.rivalFamiliarFoeBg }, styles.rivalCardFamiliarFoe]}>
                <View style={[styles.rivalAvatar, styles.rivalAvatarFamiliarFoe]}>
                  <Text style={styles.rivalInitial}>{mostPlayedAgainst.username.charAt(0) || '?'}</Text>
                </View>
                <View style={styles.rivalInfo}>
                  <Text style={[styles.rivalName, { color: colors.textPrimary }]}>{mostPlayedAgainst.displayName ?? mostPlayedAgainst.username}</Text>
                  <Text style={[styles.rivalMeta, { color: colors.textSecondary }]}>
                    {mostPlayedAgainst.wins}W – {mostPlayedAgainst.losses}L · {visibleGames(mostPlayedAgainst.games).map((g) => GAME_EMOJI[g]).join(' ')}
                  </Text>
                </View>
                <View style={[styles.rivalBadge, styles.familiarFoeBadge]}>
                  <Text style={[styles.rivalBadgeText, styles.familiarFoeBadgeText]}>MOST PLAYED</Text>
                </View>
              </View>
            </>
          )}
        </View>
      )}

      <HowItWorksSheet
        visible={showGuide}
        welcome={welcome}
        showRewards={rewardsAvailable}
        onClose={closeGuide}
        onOpenCalendar={() => { closeGuide(); router.push('/(tabs)/calendar'); }}
        onOpenFind={() => { closeGuide(); router.push('/(tabs)/browse'); }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  howItWorksCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  guideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  guideButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  guideButtonArrow: {
    fontSize: 16,
    fontWeight: '700',
  },
  rewardIntro: {
    fontSize: 13,
    marginBottom: 6,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  rewardCheck: {
    width: 20,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  rewardText: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  rewardHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  rewardPoints: {
    fontSize: 13,
    fontWeight: '800',
  },
  greeting: {
    fontSize: 14,
  },
  username: {
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },
  location: {
    fontSize: 13,
    marginTop: 4,
  },
  headerRight: {
    alignItems: 'center',
    gap: 8,
  },
  gearBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: {
    fontSize: 24,
  },
  xpBadge: {
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  xpShop: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    marginTop: 2,
  },
  xpLabel: {
    fontSize: 10,
    color: '#007AFF',
    fontWeight: '800',
    letterSpacing: 1,
  },
  xpValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  recordCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
  },
  recordStat: {
    alignItems: 'center',
  },
  recordNum: {
    fontSize: 24,
    fontWeight: '800',
  },
  recordLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  recordDivider: {
    width: 1,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 2,
  },
  gamesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  gamePill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  gamePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  activeGroupCard: {
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    marginBottom: 10,
  },
  groupsHint: {
    fontSize: 12,
    marginBottom: 10,
  },
  activeGroupGame: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  activeGroupName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  activeGroupMeta: {
    fontSize: 13,
    marginBottom: 2,
  },
  activeGroupTime: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '600',
  },
  groupActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  groupActionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
  },
  groupActionEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  groupActionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  rivalCardMain: {
    borderColor: '#FF3B30',
    borderWidth: 1.5,
  },
  rivalCardContender: {
    opacity: 0.75,
  },
  rivalCardFamiliarFoe: {
    borderColor: '#5B3FCF',
    borderWidth: 1.5,
  },
  rivalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rivalAvatarMain: {
    backgroundColor: '#FF3B30',
  },
  rivalAvatarContender: {
    backgroundColor: '#555',
  },
  rivalAvatarFamiliarFoe: {
    backgroundColor: '#5B3FCF',
  },
  rivalInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  rivalInfo: {
    flex: 1,
  },
  rivalName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  rivalMeta: {
    fontSize: 12,
  },
  rivalBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
  },
  rivalBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.8,
  },
  contendersLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  contenderBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B6914',
  },
  contenderBadgeText: {
    color: '#C9952A',
  },
  familiarFoeBadge: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#5B3FCF',
  },
  familiarFoeBadgeText: {
    color: '#8B7FEF',
  },
});
