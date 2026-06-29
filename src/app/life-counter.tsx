import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert, Animated, Pressable, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useApp } from '../context/AppContext';

const LIFE_OPTIONS = [20, 25, 30, 40, 60];

/**
 * Full-screen MTG life counter with commander damage, per-cell rotation, and configurable starting life.
 * Group mode (groupId param): ties into an active group — End Game confirms a round, awards +30 winner.
 * Pickup mode (playerNames param): ad-hoc session with no Points — offers Play Again, Form a Group, or Done.
 * A setup modal on launch lets the user choose starting life (20/25/30/40/60) and enable commander damage.
 * Each player panel is split into top/bottom tap zones (+/-) with left/right orientation when rotated.
 * Commander damage tracks up to two commanders per attacker; 21 damage from one commander = eliminated.
 * Parameters: groupId (group mode) or playerNames (comma-separated, pickup mode).
 * Returns: a full-screen life tracker; close button exits without recording a game.
 * Edge cases: closing without ending a game leaves all state unchanged; empty player list returns null.
 */
export default function LifeCounter() {
  const router = useRouter();
  const { groupId, playerNames } = useLocalSearchParams<{ groupId?: string; playerNames?: string }>();
  const { groups, setGroups, currentUser, awardPoints } = useApp();

  const isPickup = !!playerNames && !groupId;
  const group = !isPickup ? groups.find((g) => g.id === Number(groupId)) : undefined;

  const pickupPlayerList = playerNames
    ? playerNames.split(',').map((name, idx) => ({
        id: idx, username: name.trim(), bracket: 2, location: '', role: 'Member',
      }))
    : [];

  const players = group?.players ?? pickupPlayerList;

  // ── Setup modal state ────────────────────────────────────────────────────
  const [showSetup, setShowSetup] = useState(true);
  const [startingLife, setStartingLife] = useState(40);
  const [cmdMode, setCmdMode] = useState(false);

  // ── Life totals ──────────────────────────────────────────────────────────
  const [lifeTotals, setLifeTotals] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach((p) => { init[p.username] = 40; });
    return init;
  });

  const [customLifeFor, setCustomLifeFor] = useState<string | null>(null);
  const [customLifeInput, setCustomLifeInput] = useState('');

  // ── Commander damage: cmdDmg[victim][attacker] = [cmd1Dmg, cmd2Dmg] ─────
  const [cmdDmg, setCmdDmg] = useState<Record<string, Record<string, [number, number]>>>({});
  const [cmdPanelFor, setCmdPanelFor] = useState<string | null>(null);

  // ── Per-cell rotation ────────────────────────────────────────────────────
  const [cellRotated, setCellRotated] = useState<Record<string, boolean>>({});

  // ── Winner picker ────────────────────────────────────────────────────────
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [pickerPhase, setPickerPhase] = useState<'winner' | 'celebrate'>('winner');
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  const pickRandom = () =>
    players.length > 0 ? players[Math.floor(Math.random() * players.length)].username : '';

  const [firstPlayer, setFirstPlayer] = useState<string>(pickRandom);

  if (players.length === 0) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const applyStartingLife = () => {
    const init: Record<string, number> = {};
    players.forEach((p) => { init[p.username] = startingLife; });
    setLifeTotals(init);
    setShowSetup(false);
  };

  const adjustLife = (username: string, delta: number) => {
    Haptics.selectionAsync();
    setLifeTotals((prev) => ({ ...prev, [username]: (prev[username] ?? startingLife) + delta }));
  };

  const openCustomLife = (username: string) => {
    setCustomLifeFor(username);
    setCustomLifeInput(String(lifeTotals[username] ?? startingLife));
  };

  const confirmCustomLife = () => {
    const val = parseInt(customLifeInput, 10);
    if (!isNaN(val) && customLifeFor) {
      Haptics.selectionAsync();
      setLifeTotals((prev) => ({ ...prev, [customLifeFor]: val }));
    }
    setCustomLifeFor(null);
  };

  const adjustCmdDmg = (victim: string, attacker: string, slot: 0 | 1, delta: number) => {
    Haptics.selectionAsync();
    setCmdDmg((prev) => {
      const victimMap = prev[victim] ?? {};
      const cur = victimMap[attacker] ?? [0, 0];
      const updated: [number, number] = [
        slot === 0 ? Math.max(0, cur[0] + delta) : cur[0],
        slot === 1 ? Math.max(0, cur[1] + delta) : cur[1],
      ];
      return { ...prev, [victim]: { ...victimMap, [attacker]: updated } };
    });
  };

  const getCmdDmgTotal = (victim: string, attacker: string): number => {
    const pair = cmdDmg[victim]?.[attacker] ?? [0, 0];
    return pair[0] + pair[1];
  };

  const handleReset = () => {
    Alert.alert('Reset Life Counters', 'Choose how to reset:', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset All',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const reset: Record<string, number> = {};
          players.forEach((p) => { reset[p.username] = startingLife; });
          setLifeTotals(reset);
          setCmdDmg({});
        },
      },
      {
        text: 'Reset Mine',
        onPress: () => {
          const me = currentUser?.username;
          if (!me) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setLifeTotals((prev) => ({ ...prev, [me]: startingLife }));
          setCmdDmg((prev) => {
            const next = { ...prev };
            delete next[me];
            return next;
          });
        },
      },
      {
        text: 'Pick Starting Life',
        onPress: () => setShowSetup(true),
      },
    ]);
  };

  const animateCelebration = () => {
    celebScale.setValue(0.5); celebOpacity.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 600);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleEndGame = () => {
    Alert.alert('End Game', 'Did your pod finish a game?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: () => {
          if (!isPickup) {
            setGroups((prev) =>
              prev.map((g) =>
                g.id === Number(groupId) ? { ...g, confirmed: true, roundsPlayed: g.roundsPlayed + 1 } : g
              )
            );
          }
          setPickerPhase('winner');
          setShowWinnerPicker(true);
          Haptics.selectionAsync();
        },
      },
    ]);
  };

  const handleSelectWinner = (winnerUsername: string) => {
    setRoundWinner(winnerUsername);
    if (!isPickup && winnerUsername === currentUser?.username) awardPoints(30);
    setPickerPhase('celebrate');
    animateCelebration();
  };

  const handlePlayAnotherRound = () => {
    setRoundWinner(null); setPickerPhase('winner');
    setGroups((prev) => prev.map((g) => g.id === Number(groupId) ? { ...g, confirmed: false } : g));
    setShowWinnerPicker(false);
    router.back();
  };

  const handleEndSession = () => {
    if (group && group.roundsPlayed > 0) awardPoints(10);
    setGroups((prev) => prev.filter((g) => g.id !== Number(groupId)));
    setShowWinnerPicker(false);
    router.replace('/(tabs)/browse');
  };

  const handlePlayAgain = () => {
    setFirstPlayer(pickRandom());
    const reset: Record<string, number> = {};
    players.forEach((p) => { reset[p.username] = startingLife; });
    setLifeTotals(reset);
    setCmdDmg({});
    setRoundWinner(null); setPickerPhase('winner'); setShowWinnerPicker(false);
  };

  const handleFormGroup = () => {
    setShowWinnerPicker(false);
    router.replace({ pathname: '/(tabs)/browse', params: { openCreate: '1' } });
  };

  const handlePickupDone = () => {
    setShowWinnerPicker(false);
    router.replace('/(tabs)/home');
  };

  // ── Layout ───────────────────────────────────────────────────────────────

  const topPlayers = players.slice(0, Math.floor(players.length / 2));
  const bottomPlayers = players.slice(Math.floor(players.length / 2));

  const renderCell = (username: string, rotated: boolean) => {
    const life = lifeTotals[username] ?? startingLife;
    const isFirst = username === firstPlayer;
    const isDead = life <= 0;
    const isCellRotated = cellRotated[username] ?? false;

    const totalCmdDmgReceived = players
      .filter((p) => p.username !== username)
      .reduce((sum, p) => sum + getCmdDmgTotal(username, p.username), 0);

    const container = (
      <View
        key={username}
        style={[styles.cell, isFirst && styles.cellFirst, rotated && !isCellRotated && styles.cellRotated]}
      >
        {/* Rotate toggle */}
        <Pressable
          style={styles.rotateCellBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setCellRotated((prev) => ({ ...prev, [username]: !prev[username] }));
          }}
        >
          <Text style={styles.rotateCellIcon}>⟳</Text>
        </Pressable>

        {/* +/- halves — column (normal) or row (rotated) */}
        <View style={[styles.halfContainer, isCellRotated && styles.halfContainerRow]}>
          <Pressable
            style={({ pressed }) => [
              styles.halfBtn,
              isCellRotated ? styles.halfBtnLeft : styles.halfBtnPlus,
              { opacity: pressed ? 0.75 : 0.3 },
            ]}
            onPress={() => adjustLife(username, +1)}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, +10); }}
            delayLongPress={400}
          >
            <Text style={[styles.halfBtnLabel, isCellRotated && styles.halfBtnLabelSide]}>+</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.halfBtn,
              isCellRotated ? styles.halfBtnRight : styles.halfBtnMinus,
              { opacity: pressed ? 0.75 : 0.3 },
            ]}
            onPress={() => adjustLife(username, -1)}
            onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, -10); }}
            delayLongPress={400}
          >
            <Text style={[styles.halfBtnLabel, isCellRotated && styles.halfBtnLabelSide]}>−</Text>
          </Pressable>
        </View>

        {/* Centre overlay */}
        <View style={styles.cellCenter} pointerEvents="none">
          <Pressable
            style={styles.lifeTapArea}
            onLongPress={() => openCustomLife(username)}
            delayLongPress={600}
          >
            <Text style={[styles.lifeTotal, isDead && styles.lifeDead, isCellRotated && styles.lifeTotalRotated]}>
              {life}
            </Text>
          </Pressable>
          <Text style={[styles.playerName, isCellRotated && styles.playerNameRotated]}>{username}</Text>
          {isFirst && (
            <View style={styles.firstBadge}>
              <Text style={styles.firstBadgeText}>GOES FIRST</Text>
            </View>
          )}
          {cmdMode && totalCmdDmgReceived > 0 && (
            <View style={styles.cmdDmgBadge}>
              <Text style={styles.cmdDmgBadgeText}>⚔️ {totalCmdDmgReceived}</Text>
            </View>
          )}
        </View>

        {/* Commander damage button */}
        {cmdMode && (
          <Pressable
            style={styles.cmdBtn}
            onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(username); }}
          >
            <Text style={styles.cmdBtnText}>CMD</Text>
          </Pressable>
        )}
      </View>
    );

    return container;
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Setup modal ── */}
      {showSetup && (
        <View style={styles.overlay}>
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Game Setup</Text>

            <Text style={styles.setupLabel}>Starting Life Total</Text>
            <View style={styles.lifeOptionRow}>
              {LIFE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.lifeOptionBtn, startingLife === opt && styles.lifeOptionBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setStartingLife(opt); }}
                >
                  <Text style={[styles.lifeOptionText, startingLife === opt && styles.lifeOptionTextActive]}>
                    {opt}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.cmdToggleRow]}
              onPress={() => { Haptics.selectionAsync(); setCmdMode((v) => !v); }}
            >
              <View style={[styles.cmdToggle, cmdMode && styles.cmdToggleOn]}>
                <View style={[styles.cmdToggleThumb, cmdMode && styles.cmdToggleThumbOn]} />
              </View>
              <View style={styles.cmdToggleInfo}>
                <Text style={styles.cmdToggleLabel}>Commander Damage Tracking</Text>
                <Text style={styles.cmdToggleHint}>Track ⚔️ damage + partner commanders</Text>
              </View>
            </Pressable>

            <Pressable style={styles.setupStartBtn} onPress={applyStartingLife}>
              <Text style={styles.setupStartBtnText}>Start Game →</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Custom life input modal ── */}
      {customLifeFor && (
        <View style={styles.overlay}>
          <View style={styles.customLifeCard}>
            <Text style={styles.customLifeTitle}>Set Life Total</Text>
            <Text style={styles.customLifeName}>{customLifeFor}</Text>
            <TextInput
              style={styles.customLifeInput}
              value={customLifeInput}
              onChangeText={setCustomLifeInput}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.customLifeBtns}>
              <Pressable style={styles.customLifeCancel} onPress={() => setCustomLifeFor(null)}>
                <Text style={styles.customLifeCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.customLifeConfirm} onPress={confirmCustomLife}>
                <Text style={styles.customLifeConfirmText}>Set</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Commander damage panel ── */}
      {cmdPanelFor && (
        <View style={styles.overlay}>
          <View style={styles.cmdCard}>
            <Text style={styles.cmdCardTitle}>⚔️ Commander Damage</Text>
            <Text style={styles.cmdCardSub}>{cmdPanelFor} received from:</Text>
            <ScrollView style={styles.cmdScroll}>
              {players.filter((p) => p.username !== cmdPanelFor).map((attacker) => {
                const pair = cmdDmg[cmdPanelFor]?.[attacker.username] ?? [0, 0];
                const total = pair[0] + pair[1];
                const eliminated = pair[0] >= 21 || pair[1] >= 21;
                return (
                  <View key={attacker.username} style={[styles.cmdAttackerRow, eliminated && styles.cmdAttackerElim]}>
                    <Text style={[styles.cmdAttackerName, eliminated && styles.cmdAttackerNameElim]}>
                      {attacker.username}{eliminated ? ' ☠️' : ''}
                    </Text>
                    <View style={styles.cmdSlots}>
                      {([0, 1] as (0 | 1)[]).map((slot) => (
                        <View key={slot} style={styles.cmdSlot}>
                          <Text style={styles.cmdSlotLabel}>Cmd {slot + 1}</Text>
                          <View style={styles.cmdSlotRow}>
                            <Pressable style={styles.cmdAdjBtn}
                              onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, slot, -1)}>
                              <Text style={styles.cmdAdjBtnText}>−</Text>
                            </Pressable>
                            <Text style={[styles.cmdSlotVal, pair[slot] >= 21 && styles.cmdSlotValDead]}>
                              {pair[slot]}
                            </Text>
                            <Pressable style={styles.cmdAdjBtn}
                              onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, slot, +1)}>
                              <Text style={styles.cmdAdjBtnText}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.cmdTotal}>Total: {total}</Text>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable style={styles.cmdCloseBtn} onPress={() => setCmdPanelFor(null)}>
              <Text style={styles.cmdCloseBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Winner picker / celebration overlay ── */}
      {showWinnerPicker && (
        <View style={styles.overlay}>
          {pickerPhase === 'winner' ? (
            <View style={styles.pickerCard}>
              <Text style={styles.celebEmoji}>🏆</Text>
              <Text style={styles.celebTitle}>
                {isPickup ? 'Who Won?' : `Who Won Round ${group?.roundsPlayed}?`}
              </Text>
              <Text style={styles.celebSub}>Select the winner</Text>
              {players.map((player) => (
                <Pressable
                  key={player.id}
                  style={styles.winnerOption}
                  onPress={() => handleSelectWinner(player.username)}
                >
                  <View style={styles.winnerAvatar}>
                    <Text style={styles.winnerInitial}>{player.username.charAt(0) || '?'}</Text>
                  </View>
                  <Text style={styles.winnerName}>{player.username}</Text>
                  {player.username === currentUser?.username && (
                    <View style={styles.winnerYouTag}><Text style={styles.winnerYouText}>You</Text></View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : (
            <Animated.View style={[styles.pickerCard, { transform: [{ scale: celebScale }], opacity: celebOpacity }]}>
              <Text style={styles.celebEmoji}>🎉</Text>
              <Text style={styles.celebTitle}>
                {isPickup ? 'Game Over!' : `Round ${group?.roundsPlayed} Complete!`}
              </Text>
              <View style={styles.winnerAnnounce}>
                <Text style={styles.winnerAnnounceLabel}>WINNER</Text>
                <Text style={styles.winnerAnnounceName}>{roundWinner}</Text>
              </View>
              {!isPickup && roundWinner === currentUser?.username && (
                <Text style={styles.celebXP}>+30 Points</Text>
              )}
              <Text style={styles.celebSub}>
                {isPickup ? 'Nice game! Play again or form a group.' : roundWinner === currentUser?.username ? 'You took it down!' : 'Good game.'}
              </Text>
              {isPickup ? (
                <>
                  <View style={styles.celebBtnRow}>
                    <Pressable style={styles.celebBtnSecondary} onPress={handlePickupDone}>
                      <Text style={styles.celebBtnSecondaryText}>Done</Text>
                    </Pressable>
                    <Pressable style={styles.celebBtn} onPress={handlePlayAgain}>
                      <Text style={styles.celebBtnText}>▶ Play Again</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.formGroupBtn} onPress={handleFormGroup}>
                    <Text style={styles.formGroupBtnText}>Form a Group to Earn Rewards →</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.celebBtnRow}>
                  <Pressable style={styles.celebBtnSecondary} onPress={handleEndSession}>
                    <Text style={styles.celebBtnSecondaryText}>End Session</Text>
                  </Pressable>
                  <Pressable style={styles.celebBtn} onPress={handlePlayAnotherRound}>
                    <Text style={styles.celebBtnText}>▶ Another Round</Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          )}
        </View>
      )}

      {/* ── Life counter grid ── */}
      {topPlayers.length > 0 && (
        <View style={styles.row}>
          {topPlayers.map((p) => renderCell(p.username, true))}
        </View>
      )}

      <View style={styles.divider}>
        <Pressable style={styles.dividerBtn} onPress={handleReset}>
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
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  row: { flex: 1, flexDirection: 'row' },
  rowFull: { flex: 1 },

  /* Cells */
  cell: { flex: 1, position: 'relative', borderWidth: 0.5, borderColor: '#1E1E2A' },
  cellRotated: { transform: [{ rotate: '180deg' }] },
  cellFirst: { borderColor: '#FFD700', borderWidth: 1.5 },

  halfContainer: { flex: 1 },
  halfContainerRow: { flexDirection: 'row' },

  halfBtn: { flex: 1, width: '100%', alignItems: 'center' },
  halfBtnPlus: { backgroundColor: '#1A3A1A', justifyContent: 'flex-start', paddingTop: 16 },
  halfBtnMinus: { backgroundColor: '#3A1A1A', justifyContent: 'flex-end', paddingBottom: 16 },
  halfBtnLeft: { backgroundColor: '#1A3A1A', justifyContent: 'flex-start', paddingLeft: 12, alignItems: 'flex-start' },
  halfBtnRight: { backgroundColor: '#3A1A1A', justifyContent: 'flex-end', paddingRight: 12, alignItems: 'flex-end' },
  halfBtnLabel: { fontSize: 32, color: '#FFF', fontWeight: '200' },
  halfBtnLabelSide: { fontSize: 32, color: '#FFF', fontWeight: '200' },

  cellCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  lifeTapArea: { alignItems: 'center' },
  lifeTotal: { fontSize: 86, fontWeight: '900', color: '#FFF', lineHeight: 92, textAlign: 'center' },
  lifeTotalRotated: { fontSize: 70 },
  lifeDead: { color: '#FF3B30' },
  playerName: { fontSize: 13, fontWeight: '700', color: '#888', textAlign: 'center', letterSpacing: 0.5 },
  playerNameRotated: { transform: [{ rotate: '-90deg' }] },
  firstBadge: { backgroundColor: '#FFD700', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  firstBadgeText: { fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1.5 },
  cmdDmgBadge: { backgroundColor: '#3A1A1A', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  cmdDmgBadgeText: { fontSize: 11, color: '#FF6B6B', fontWeight: '700' },

  rotateCellBtn: {
    position: 'absolute', top: 4, right: 4, zIndex: 10,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  rotateCellIcon: { fontSize: 14, color: '#888' },

  cmdBtn: {
    position: 'absolute', bottom: 6, left: 6, zIndex: 10,
    backgroundColor: 'rgba(138,60,60,0.6)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  cmdBtnText: { fontSize: 10, fontWeight: '800', color: '#FF9090', letterSpacing: 1 },

  /* Divider */
  divider: {
    height: 64, backgroundColor: '#050508', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#1E1E2A',
  },
  dividerBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#1C1C28',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C2C3C',
  },
  dividerBtnText: { fontSize: 22, color: '#888' },
  endGameBtn: {
    backgroundColor: '#1A0A00', borderRadius: 14, paddingVertical: 13,
    paddingHorizontal: 32, borderWidth: 1.5, borderColor: '#8B3A3A',
  },
  endGameBtnText: { color: '#C0605A', fontWeight: '700', fontSize: 17, letterSpacing: 0.5 },

  /* Overlay */
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.90)', alignItems: 'center',
    justifyContent: 'center', zIndex: 99,
  },

  /* Setup modal */
  setupCard: {
    backgroundColor: '#1C1C24', borderRadius: 24, padding: 28,
    width: '90%', borderWidth: 1, borderColor: '#2C2C3C',
  },
  setupTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 20 },
  setupLabel: { fontSize: 12, fontWeight: '700', color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  lifeOptionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  lifeOptionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#111118', borderWidth: 1.5, borderColor: '#2C2C3C',
  },
  lifeOptionBtnActive: { backgroundColor: '#003A00', borderColor: '#34C759' },
  lifeOptionText: { fontSize: 18, fontWeight: '800', color: '#555' },
  lifeOptionTextActive: { color: '#34C759' },

  cmdToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24, padding: 14, backgroundColor: '#111118', borderRadius: 14, borderWidth: 1, borderColor: '#2C2C3C' },
  cmdToggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#2C2C3C', justifyContent: 'center', paddingHorizontal: 3 },
  cmdToggleOn: { backgroundColor: '#34C759' },
  cmdToggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  cmdToggleThumbOn: { transform: [{ translateX: 20 }] },
  cmdToggleInfo: { flex: 1 },
  cmdToggleLabel: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  cmdToggleHint: { fontSize: 12, color: '#888' },

  setupStartBtn: { backgroundColor: '#34C759', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  setupStartBtnText: { color: '#FFF', fontWeight: '800', fontSize: 17 },

  /* Custom life input */
  customLifeCard: {
    backgroundColor: '#1C1C24', borderRadius: 20, padding: 24,
    width: '80%', alignItems: 'center', borderWidth: 1, borderColor: '#2C2C3C',
  },
  customLifeTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  customLifeName: { fontSize: 14, color: '#888', marginBottom: 16 },
  customLifeInput: {
    backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#34C759',
    color: '#FFF', fontSize: 36, fontWeight: '900', textAlign: 'center',
    paddingVertical: 12, paddingHorizontal: 20, width: '100%', marginBottom: 20,
  },
  customLifeBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  customLifeCancel: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#222' },
  customLifeCancelText: { color: '#888', fontWeight: '700', fontSize: 15 },
  customLifeConfirm: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#34C759' },
  customLifeConfirmText: { color: '#FFF', fontWeight: '800', fontSize: 15 },

  /* Commander damage panel */
  cmdCard: {
    backgroundColor: '#1C1C24', borderRadius: 24, padding: 24, width: '92%',
    maxHeight: '80%', borderWidth: 1, borderColor: '#8B3A3A',
  },
  cmdCardTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  cmdCardSub: { fontSize: 13, color: '#888', marginBottom: 14 },
  cmdScroll: { maxHeight: 300 },
  cmdAttackerRow: {
    backgroundColor: '#111118', borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#2C2C3C',
  },
  cmdAttackerElim: { borderColor: '#FF3B30', backgroundColor: '#1F0808' },
  cmdAttackerName: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 10 },
  cmdAttackerNameElim: { color: '#FF3B30' },
  cmdSlots: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cmdSlot: { flex: 1 },
  cmdSlotLabel: { fontSize: 10, color: '#666', fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  cmdSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cmdAdjBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#2C2C3C',
    alignItems: 'center', justifyContent: 'center',
  },
  cmdAdjBtnText: { fontSize: 18, color: '#FFF', fontWeight: '200' },
  cmdSlotVal: { fontSize: 22, fontWeight: '900', color: '#FFF', minWidth: 36, textAlign: 'center' },
  cmdSlotValDead: { color: '#FF3B30' },
  cmdTotal: { fontSize: 12, color: '#888', textAlign: 'right' },
  cmdCloseBtn: { backgroundColor: '#2C2C3C', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  cmdCloseBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  /* Winner picker */
  pickerCard: {
    backgroundColor: '#1C1C24', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '88%', borderWidth: 1, borderColor: '#34C759',
  },
  celebEmoji: { fontSize: 56, marginBottom: 12 },
  celebTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8, textAlign: 'center' },
  celebXP: { fontSize: 40, fontWeight: '800', color: '#34C759', marginBottom: 8 },
  celebSub: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  celebBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  celebBtn: { flex: 1, backgroundColor: '#34C759', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  celebBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  celebBtnSecondary: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  celebBtnSecondaryText: { color: '#888', fontWeight: '700', fontSize: 14 },
  formGroupBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#007AFF', width: '100%', alignItems: 'center' },
  formGroupBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 14 },
  winnerOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F0F14', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#2C2C38', width: '100%' },
  winnerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2C2C38', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  winnerInitial: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  winnerName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF' },
  winnerYouTag: { backgroundColor: '#007AFF', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  winnerYouText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  winnerAnnounce: { alignItems: 'center', backgroundColor: '#0F0F14', borderRadius: 12, padding: 16, marginVertical: 12, width: '100%' },
  winnerAnnounceLabel: { fontSize: 10, fontWeight: '800', color: '#888', letterSpacing: 2, marginBottom: 6 },
  winnerAnnounceName: { fontSize: 28, fontWeight: '900', color: '#FFF' },
});
