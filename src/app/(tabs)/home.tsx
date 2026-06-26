import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../context/AppContext';
import { GAME_COLOR, GAME_EMOJI, GAME_LABELS } from '../../data/types';

/**
 * Home tab — the player's personal dashboard after logging in.
 * Shows their XP and win/loss record, their active group (if any), rivals, and quick-action buttons.
 * Parameters: none; reads currentUser, groups, and rivals from global context.
 * Returns: a scrollable dashboard screen.
 * Edge cases: gracefully hides sections that have no data (no active group, no rivals yet).
 */
export default function HomeScreen() {
  const router = useRouter();
  const { currentUser, groups, rivals, chosenRivalId, mostPlayedAgainst, awardPoints } = useApp();

  if (!currentUser) return null;

  const activeGroup = groups.find((g) =>
    g.players.some((p) => p.username === currentUser.username)
  );

  const totalGames = currentUser.wins + currentUser.losses;
  const winPct = totalGames === 0 ? 0 : Math.round((currentUser.wins / totalGames) * 100);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.username}>{currentUser.username}</Text>
          <Text style={styles.location}>{currentUser.location}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.gearBtn}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={styles.gearIcon}>⚙️</Text>
          </Pressable>
          <View style={styles.xpBadge}>
            <Text style={styles.xpLabel}>PTS</Text>
            <Text style={styles.xpValue}>{currentUser.points}</Text>
          </View>
        </View>
      </View>

      {/* Record card */}
      <View style={styles.recordCard}>
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={styles.recordNum}>{currentUser.wins}</Text>
            <Text style={styles.recordLabel}>Wins</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordStat}>
            <Text style={styles.recordNum}>{currentUser.losses}</Text>
            <Text style={styles.recordLabel}>Losses</Text>
          </View>
          <View style={styles.recordDivider} />
          <View style={styles.recordStat}>
            <Text style={styles.recordNum}>{winPct}%</Text>
            <Text style={styles.recordLabel}>Win Rate</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${winPct}%` }]} />
        </View>
      </View>

      {/* Games played */}
      <View style={styles.gamesRow}>
        {currentUser.games.map((g) => (
          <View key={g} style={[styles.gamePill, { borderColor: GAME_COLOR[g] }]}>
            <Text style={styles.gamePillText}>
              {GAME_EMOJI[g]} {GAME_LABELS[g]}
            </Text>
          </View>
        ))}
      </View>

      {/* Active group */}
      {activeGroup ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Active Group</Text>
          <Pressable
            style={[styles.activeGroupCard, { borderLeftColor: GAME_COLOR[activeGroup.gameType] }]}
            onPress={() => router.push({ pathname: '/group-detail', params: { id: activeGroup.id } })}
          >
            <Text style={styles.activeGroupGame}>
              {GAME_EMOJI[activeGroup.gameType]} {activeGroup.format}
            </Text>
            <Text style={styles.activeGroupName}>{activeGroup.name}</Text>
            <Text style={styles.activeGroupMeta}>
              {activeGroup.players.length}/{activeGroup.targetPlayers} players · {activeGroup.location}
            </Text>
            <Text style={styles.activeGroupTime}>{activeGroup.time}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>No Active Group</Text>
          <Pressable style={styles.findBtn} onPress={() => router.push('/(tabs)/browse')}>
            <Text style={styles.findBtnText}>Find a Group →</Text>
          </Pressable>
        </View>
      )}

      {/* Rivals */}
      {rivals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Rival</Text>

          {/* Chosen rival */}
          {rivals.filter((r) => r.id === chosenRivalId).map((rival) => (
            <Pressable key={rival.id} style={[styles.rivalCard, styles.rivalCardMain]} onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}>
              <View style={[styles.rivalAvatar, styles.rivalAvatarMain]}>
                <Text style={styles.rivalInitial}>{rival.username[0]}</Text>
              </View>
              <View style={styles.rivalInfo}>
                <Text style={styles.rivalName}>{rival.username}</Text>
                <Text style={styles.rivalMeta}>
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
              <Text style={styles.contendersLabel}>CONTENDERS</Text>
              {rivals.filter((r) => r.id !== chosenRivalId).map((rival) => (
                <Pressable key={rival.id} style={[styles.rivalCard, styles.rivalCardContender]} onPress={() => router.push({ pathname: '/player-profile', params: { username: rival.username } })}>
                  <View style={[styles.rivalAvatar, styles.rivalAvatarContender]}>
                    <Text style={styles.rivalInitial}>{rival.username[0]}</Text>
                  </View>
                  <View style={styles.rivalInfo}>
                    <Text style={styles.rivalName}>{rival.username}</Text>
                    <Text style={styles.rivalMeta}>
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
              <Text style={styles.contendersLabel}>FAMILIAR FOE</Text>
              <View style={[styles.rivalCard, styles.rivalCardFamiliarFoe]}>
                <View style={[styles.rivalAvatar, styles.rivalAvatarFamiliarFoe]}>
                  <Text style={styles.rivalInitial}>{mostPlayedAgainst.username[0]}</Text>
                </View>
                <View style={styles.rivalInfo}>
                  <Text style={styles.rivalName}>{mostPlayedAgainst.username}</Text>
                  <Text style={styles.rivalMeta}>
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

      {/* Quick actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push('/(tabs)/browse')}>
            <Text style={styles.actionEmoji}>🔍</Text>
            <Text style={styles.actionLabel}>Find a Group</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push({ pathname: '/(tabs)/browse', params: { openCreate: '1' } })}
          >
            <Text style={styles.actionEmoji}>➕</Text>
            <Text style={styles.actionLabel}>Create Group</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
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
    color: '#666',
  },
  username: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    marginTop: 2,
  },
  location: {
    fontSize: 13,
    color: '#555',
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
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2C2C38',
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
    color: '#FFF',
  },
  recordCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C38',
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
    color: '#FFF',
  },
  recordLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  recordDivider: {
    width: 1,
    backgroundColor: '#2C2C38',
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#2C2C38',
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
    backgroundColor: '#1C1C24',
  },
  gamePillText: {
    fontSize: 13,
    color: '#CCC',
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  activeGroupCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  activeGroupGame: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
    fontWeight: '600',
  },
  activeGroupName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 6,
  },
  activeGroupMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  activeGroupTime: {
    fontSize: 13,
    color: '#007AFF',
    marginTop: 4,
    fontWeight: '600',
  },
  findBtn: {
    backgroundColor: '#1C1C24',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  findBtnText: {
    fontSize: 15,
    color: '#007AFF',
    fontWeight: '700',
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  rivalCardMain: {
    borderColor: '#FF3B30',
    backgroundColor: '#1F1012',
    borderWidth: 1.5,
  },
  rivalCardContender: {
    opacity: 0.75,
  },
  rivalCardFamiliarFoe: {
    borderColor: '#5B3FCF',
    backgroundColor: '#12101F',
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
    color: '#FFF',
    marginBottom: 2,
  },
  rivalMeta: {
    fontSize: 12,
    color: '#666',
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
    color: '#555',
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
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1C1C24',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C38',
  },
  actionEmoji: {
    fontSize: 26,
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 13,
    color: '#AAA',
    fontWeight: '600',
  },
});
