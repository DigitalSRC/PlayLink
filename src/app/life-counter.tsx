import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Animated, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../context/AppContext';

const STARTING_LIFE = 40;

/**
 * Full-screen MTG life counter that doubles as the session controller for a group.
 * Each player panel is split into two tap zones: upper half adds life, lower half subtracts.
 * Zones show at 30% opacity and highlight to 75% on press; long-press adjusts by 10.
 * One player is randomly chosen as first and highlighted with a gold GOES FIRST badge.
 * End Game opens the winner picker; the winner earns +30 Points; End Session gives +10 consolation.
 * Parameters: groupId — route param matching the active group's id in global context.
 * Returns: a full-screen life tracker; close button returns to group detail without recording a game.
 * Edge cases: closing without ending a game leaves the group unchanged and awards no points.
 */
export default function LifeCounter() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { groups, setGroups, currentUser, awardPoints } = useApp();

  const group = groups.find((g) => g.id === Number(groupId));
  const players = group?.players ?? [];

  const [lifeTotals, setLifeTotals] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach((p) => { init[p.username] = STARTING_LIFE; });
    return init;
  });

  const [firstPlayer] = useState<string>(() => {
    if (players.length === 0) return '';
    return players[Math.floor(Math.random() * players.length)].username;
  });

  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [pickerPhase, setPickerPhase] = useState<'winner' | 'celebrate'>('winner');
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  const adjustLife = (username: string, delta: number) => {
    Haptics.selectionAsync();
    setLifeTotals((prev) => ({ ...prev, [username]: (prev[username] ?? STARTING_LIFE) + delta }));
  };

  const resetAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const reset: Record<string, number> = {};
    players.forEach((p) => { reset[p.username] = STARTING_LIFE; });
    setLifeTotals(reset);
  };

  const animateCelebration = () => {
    celebScale.setValue(0.5);
    celebOpacity.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleEndGame = () => {
    Alert.alert(
      'End Game',
      'Did your pod finish a game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes',
          onPress: () => {
            setGroups((prev) =>
              prev.map((g) =>
                g.id === Number(groupId)
                  ? { ...g, confirmed: true, roundsPlayed: g.roundsPlayed + 1 }
                  : g
              )
            );
            setPickerPhase('winner');
            setShowWinnerPicker(true);
            Haptics.selectionAsync();
          },
        },
      ]
    );
  };

  const handleSelectWinner = (winnerUsername: string) => {
    setRoundWinner(winnerUsername);
    if (winnerUsername === currentUser?.username) {
      awardPoints(30);
    }
    setPickerPhase('celebrate');
    animateCelebration();
  };

  const handlePlayAnotherRound = () => {
    setRoundWinner(null);
    setPickerPhase('winner');
    setGroups((prev) =>
      prev.map((g) => (g.id === Number(groupId) ? { ...g, confirmed: false } : g))
    );
    setShowWinnerPicker(false);
    router.back();
  };

  const handleEndSession = () => {
    if (group && group.roundsPlayed > 0) {
      awardPoints(10);
    }
    setGroups((prev) => prev.filter((g) => g.id !== Number(groupId)));
    setShowWinnerPicker(false);
    router.replace('/(tabs)/browse');
  };

  // Top half of the table gets rotated 180° so those players face their own panels
  const topPlayers = players.slice(0, Math.floor(players.length / 2));
  const bottomPlayers = players.slice(Math.floor(players.length / 2));

  const renderCell = (username: string, rotated: boolean) => {
    const life = lifeTotals[username] ?? STARTING_LIFE;
    const isFirst = username === firstPlayer;
    const isDead = life <= 0;

    return (
      <View
        key={username}
        style={[styles.cell, isFirst && styles.cellFirst, rotated && styles.cellRotated]}
      >
        {/* Upper half — tap +1, long-press +10 */}
        <Pressable
          style={({ pressed }) => [
            styles.halfBtn,
            styles.halfBtnPlus,
            { opacity: pressed ? 0.75 : 0.3 },
          ]}
          onPress={() => adjustLife(username, +1)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            adjustLife(username, +10);
          }}
          delayLongPress={400}
        >
          <Text style={styles.halfBtnLabel}>+</Text>
        </Pressable>

        {/* Lower half — tap -1, long-press -10 */}
        <Pressable
          style={({ pressed }) => [
            styles.halfBtn,
            styles.halfBtnMinus,
            { opacity: pressed ? 0.75 : 0.3 },
          ]}
          onPress={() => adjustLife(username, -1)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            adjustLife(username, -10);
          }}
          delayLongPress={400}
        >
          <Text style={styles.halfBtnLabel}>−</Text>
        </Pressable>

        {/* Centre overlay — non-interactive, touches fall through to the half buttons */}
        <View style={styles.cellCenter} pointerEvents="none">
          <Text style={[styles.lifeTotal, isDead && styles.lifeDead]}>{life}</Text>
          <Text style={styles.playerName}>{username}</Text>
          {isFirst && (
            <View style={styles.firstBadge}>
              <Text style={styles.firstBadgeText}>GOES FIRST</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Winner picker / celebration overlay */}
      {showWinnerPicker && (
        <View style={styles.overlay}>
          {pickerPhase === 'winner' ? (
            <View style={styles.pickerCard}>
              <Text style={styles.celebEmoji}>🏆</Text>
              <Text style={styles.celebTitle}>Who Won Round {group?.roundsPlayed}?</Text>
              <Text style={styles.celebSub}>Select the winner of this game</Text>
              {players.map((player) => (
                <Pressable
                  key={player.id}
                  style={styles.winnerOption}
                  onPress={() => handleSelectWinner(player.username)}
                >
                  <View style={styles.winnerAvatar}>
                    <Text style={styles.winnerInitial}>{player.username[0]}</Text>
                  </View>
                  <Text style={styles.winnerName}>{player.username}</Text>
                  {player.username === currentUser?.username && (
                    <View style={styles.winnerYouTag}>
                      <Text style={styles.winnerYouText}>You</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <Animated.View
              style={[
                styles.pickerCard,
                { transform: [{ scale: celebScale }], opacity: celebOpacity },
              ]}
            >
              <Text style={styles.celebEmoji}>🎉</Text>
              <Text style={styles.celebTitle}>Round {group?.roundsPlayed} Complete!</Text>
              <View style={styles.winnerAnnounce}>
                <Text style={styles.winnerAnnounceLabel}>WINNER</Text>
                <Text style={styles.winnerAnnounceName}>{roundWinner}</Text>
              </View>
              {roundWinner === currentUser?.username && (
                <Text style={styles.celebXP}>+30 Points</Text>
              )}
              <Text style={styles.celebSub}>
                {roundWinner === currentUser?.username
                  ? 'You took it down!'
                  : 'Good game. End the session or run it back.'}
              </Text>
              <View style={styles.celebBtnRow}>
                <Pressable style={styles.celebBtnSecondary} onPress={handleEndSession}>
                  <Text style={styles.celebBtnSecondaryText}>End Session</Text>
                </Pressable>
                <Pressable style={styles.celebBtn} onPress={handlePlayAnotherRound}>
                  <Text style={styles.celebBtnText}>▶ Another Round</Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      )}

      {topPlayers.length > 0 && (
        <View style={styles.row}>
          {topPlayers.map((p) => renderCell(p.username, true))}
        </View>
      )}

      <View style={styles.divider}>
        <Pressable style={styles.dividerBtn} onPress={resetAll}>
          <Text style={styles.dividerBtnText}>↺</Text>
        </Pressable>
        <Pressable style={styles.endGameBtn} onPress={handleEndGame}>
          <Text style={styles.endGameBtnText}>End Game</Text>
        </Pressable>
        <Pressable style={styles.dividerBtn} onPress={() => router.back()}>
          <Text style={styles.dividerBtnText}>✕</Text>
        </Pressable>
      </View>

      <View style={[styles.row, topPlayers.length === 0 && styles.rowFull]}>
        {bottomPlayers.map((p) => renderCell(p.username, false))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  rowFull: {
    flex: 1,
  },
  cell: {
    flex: 1,
    position: 'relative',
    borderWidth: 0.5,
    borderColor: '#1E1E2A',
  },
  cellRotated: {
    transform: [{ rotate: '180deg' }],
  },
  cellFirst: {
    borderColor: '#FFD700',
    borderWidth: 1.5,
  },
  halfBtn: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  halfBtnPlus: {
    backgroundColor: '#1A3A1A',
    justifyContent: 'flex-start',
    paddingTop: 16,
  },
  halfBtnMinus: {
    backgroundColor: '#3A1A1A',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  halfBtnLabel: {
    fontSize: 32,
    color: '#FFF',
    fontWeight: '200',
  },
  cellCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  lifeTotal: {
    fontSize: 86,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 92,
    textAlign: 'center',
  },
  lifeDead: {
    color: '#FF3B30',
  },
  playerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  firstBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  firstBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 1.5,
  },
  divider: {
    height: 64,
    backgroundColor: '#050508',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#1E1E2A',
  },
  dividerBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1C1C28',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C3C',
  },
  dividerBtnText: {
    fontSize: 22,
    color: '#888',
  },
  endGameBtn: {
    backgroundColor: '#1A0A00',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderWidth: 1.5,
    borderColor: '#8B3A3A',
  },
  endGameBtnText: {
    color: '#C0605A',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 0.5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99,
  },
  pickerCard: {
    backgroundColor: '#1C1C24',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '88%',
    borderWidth: 1,
    borderColor: '#34C759',
  },
  celebEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  celebTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  celebXP: {
    fontSize: 40,
    fontWeight: '800',
    color: '#34C759',
    marginBottom: 8,
  },
  celebSub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
  },
  celebBtnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  celebBtn: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  celebBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  celebBtnSecondary: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  celebBtnSecondaryText: {
    color: '#888',
    fontWeight: '700',
    fontSize: 14,
  },
  winnerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2C2C38',
    width: '100%',
  },
  winnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C38',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  winnerInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  winnerName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  winnerYouTag: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  winnerYouText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  winnerAnnounce: {
    alignItems: 'center',
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E6A817',
    width: '100%',
  },
  winnerAnnounceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E6A817',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  winnerAnnounceName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
});
