import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../../data/types';
import { useThemeColors } from '../../utils/theme-utils';

/**
 * Home tab — the player's personal dashboard after logging in.
 * Shows the player's Points balance, win/loss record, active group, and rival hierarchy.
 * Rival section distinguishes between one chosen Rival (red), up to two Contenders (gold), and an optional Familiar Foe slot for the most-played-against player.
 * A Pickup Game button launches an ad-hoc life counter session without creating a formal group.
 * Parameters: none; reads currentUser, groups, rivals, chosenRivalId, and mostPlayedAgainst from global context.
 * Returns: a scrollable dashboard screen with a Pickup Game card and quick-action buttons for Find and Create Group.
 * Edge cases: hides the active group section when the user is in no group; hides the rivals section entirely when the rivals array is empty.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { currentUser, groups, rivals, chosenRivalId, mostPlayedAgainst, awardPoints } = useApp();
  const colors = useThemeColors();

  if (!currentUser) return null;

  const activeGroup = groups.find((g) =>
    g.players.some((p) => p.username === currentUser.username)
  );

  const totalGames = currentUser.wins + currentUser.losses;
  const winPct = totalGames === 0 ? 0 : Math.round((currentUser.wins / totalGames) * 100);

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back,</Text>
          <Text style={[styles.username, { color: colors.textPrimary }]}>{currentUser.displayName ?? currentUser.username}</Text>
          <Text style={[styles.location, { color: colors.textSecondary }]}>{currentUser.location}</Text>
        </View>
        <View style={[styles.xpBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.xpLabel}>PTS</Text>
          <Text style={[styles.xpValue, { color: colors.textPrimary }]}>{currentUser.points}</Text>
        </View>
      </View>

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

      {/* Games played */}
      <View style={styles.gamesRow}>
        {currentUser.games.map((g) => (
          <View key={g} style={[styles.gamePill, { backgroundColor: colors.card, borderColor: GAME_COLOR[g] }]}>
            <Text style={[styles.gamePillText, { color: colors.textSecondary }]}>
              {GAME_EMOJI[g]} {GAME_LABELS[g]}
            </Text>
          </View>
        ))}
      </View>

      {/* Active group */}
      {activeGroup ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Your Active Group</Text>
          <Pressable
            style={[styles.activeGroupCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: GAME_COLOR[activeGroup.gameType] }]}
            onPress={() => router.push({ pathname: '/group-detail', params: { id: activeGroup.id } })}
          >
            <Text style={[styles.activeGroupGame, { color: colors.textSecondary }]}>
              {GAME_EMOJI[activeGroup.gameType]} {activeGroup.format}
            </Text>
            <Text style={[styles.activeGroupName, { color: colors.textPrimary }]}>{activeGroup.name}</Text>
            <Text style={[styles.activeGroupMeta, { color: colors.textSecondary }]}>
              {activeGroup.players.length}/{activeGroup.targetPlayers} players · {activeGroup.location}
            </Text>
            <Text style={styles.activeGroupTime}>{activeGroup.time}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>No Active Group</Text>
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
      )}

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
                  {rival.wins}W – {rival.losses}L · {rival.games.map((g) => GAME_EMOJI[g]).join(' ')}
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
                      {rival.wins}W – {rival.losses}L · {rival.games.map((g) => GAME_EMOJI[g]).join(' ')}
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
                    {mostPlayedAgainst.wins}W – {mostPlayedAgainst.losses}L · {mostPlayedAgainst.games.map((g) => GAME_EMOJI[g]).join(' ')}
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
