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
 * Full-screen MTG life counter with commander damage, per-cell landscape rotation, and configurable starting life.
 * Group mode (groupId param): tracks rounds; pickup mode (playerNames param): ad-hoc session.
 * Setup modal on launch chooses starting life (20/25/30/40/60) and enables commander damage tracking.
 * Each cell has a "Rotate" button that flips its content -90° so life reads along the phone's long edge.
 * When rotated: − on left, + on right; player name always anchored to the physical top edge.
 * Commander damage defaults to one commander per attacker; a per-attacker button adds a second (partner).
 * Parameters: groupId (group mode) or playerNames (comma-separated list, pickup mode).
 * Returns: a full-screen life tracker; close button exits without recording a game.
 * Edge cases: empty player list returns null; long-press life total to enter a custom value.
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

  // ── Setup ─────────────────────────────────────────────────────────────────
  const [showSetup, setShowSetup] = useState(true);
  const [startingLife, setStartingLife] = useState(40);
  const [cmdMode, setCmdMode] = useState(false);

  // ── Life totals ───────────────────────────────────────────────────────────
  const [lifeTotals, setLifeTotals] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    players.forEach((p) => { init[p.username] = 40; });
    return init;
  });

  const [customLifeFor, setCustomLifeFor] = useState<string | null>(null);
  const [customLifeInput, setCustomLifeInput] = useState('');

  // ── Commander damage: [victim][attacker] = [cmd1Dmg, cmd2Dmg] ────────────
  const [cmdDmg, setCmdDmg] = useState<Record<string, Record<string, [number, number]>>>({});
  const [cmdPanelFor, setCmdPanelFor] = useState<string | null>(null);
  const [cmdSecondSlot, setCmdSecondSlot] = useState<Record<string, boolean>>({});

  // ── Per-cell rotation ─────────────────────────────────────────────────────
  const [cellRotated, setCellRotated] = useState<Record<string, boolean>>({});

  // ── Winner picker ─────────────────────────────────────────────────────────
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const [pickerPhase, setPickerPhase] = useState<'winner' | 'celebrate'>('winner');
  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;

  const pickRandom = () =>
    players.length > 0 ? players[Math.floor(Math.random() * players.length)].username : '';

  const [firstPlayer, setFirstPlayer] = useState<string>(pickRandom);

  if (players.length === 0) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  const getCmdDmgTotal = (victim: string): number =>
    players.filter((p) => p.username !== victim).reduce((sum, p) => {
      const pair = cmdDmg[victim]?.[p.username] ?? [0, 0];
      return sum + pair[0] + pair[1];
    }, 0);

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
          setCmdDmg((prev) => { const n = { ...prev }; delete n[me]; return n; });
        },
      },
      {
        text: 'Change Starting Life',
        onPress: () => setShowSetup(true),
      },
    ]);
  };

  const animateCelebration = () => {
    celebScale.setValue(0.5); celebOpacity.setValue(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 300);
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, bounciness: 15 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const handleSelectWinner = (winnerUsername: string) => {
    setRoundWinner(winnerUsername);
    if (!isPickup && winnerUsername === currentUser?.username) awardPoints(30);
    if (!isPickup) {
      setGroups((prev) =>
        prev.map((g) => g.id === Number(groupId) ? { ...g, confirmed: true, roundsPlayed: g.roundsPlayed + 1 } : g)
      );
    }
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
    setCmdDmg({}); setCmdSecondSlot({});
    setRoundWinner(null); setPickerPhase('winner'); setShowWinnerPicker(false);
  };

  const handlePickupDone = () => { setShowWinnerPicker(false); router.replace('/(tabs)/home'); };
  const handleFormGroup = () => {
    setShowWinnerPicker(false);
    router.replace({ pathname: '/(tabs)/browse', params: { openCreate: '1' } });
  };

  // ── Render cell ───────────────────────────────────────────────────────────

  const topPlayers = players.slice(0, Math.floor(players.length / 2));
  const bottomPlayers = players.slice(Math.floor(players.length / 2));

  const renderCell = (username: string, isTopRow: boolean) => {
    const life = lifeTotals[username] ?? startingLife;
    const isFirst = username === firstPlayer;
    const isDead = life <= 0;
    const isCellRotated = cellRotated[username] ?? false;
    const cmdDmgTotal = getCmdDmgTotal(username);

    return (
      <View
        key={username}
        style={[
          styles.cell,
          isFirst && styles.cellFirst,
          isTopRow && !isCellRotated && styles.cellFlipped,
        ]}
      >
        {/* Player name — always anchored to physical top of the cell */}
        <View style={styles.nameBar} pointerEvents="none">
          <Text style={styles.playerName} numberOfLines={1}>{username}</Text>
        </View>

        {/* +/- halves */}
        {isCellRotated ? (
          /* Landscape: − left, + right */
          <View style={styles.halfRow}>
            <Pressable
              style={({ pressed }) => [styles.halfBtn, styles.halfLandMinus, { opacity: pressed ? 0.85 : 0.35 }]}
              onPress={() => adjustLife(username, -1)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, -10); }}
              delayLongPress={400}
            >
              <Text style={styles.halfLabel}>−</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.halfBtn, styles.halfLandPlus, { opacity: pressed ? 0.85 : 0.35 }]}
              onPress={() => adjustLife(username, +1)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, +10); }}
              delayLongPress={400}
            >
              <Text style={styles.halfLabel}>+</Text>
            </Pressable>
          </View>
        ) : (
          /* Portrait: + top, − bottom */
          <View style={styles.halfCol}>
            <Pressable
              style={({ pressed }) => [styles.halfBtn, styles.halfPortPlus, { opacity: pressed ? 0.85 : 0.35 }]}
              onPress={() => adjustLife(username, +1)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, +10); }}
              delayLongPress={400}
            >
              <Text style={styles.halfLabel}>+</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.halfBtn, styles.halfPortMinus, { opacity: pressed ? 0.85 : 0.35 }]}
              onPress={() => adjustLife(username, -1)}
              onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); adjustLife(username, -10); }}
              delayLongPress={400}
            >
              <Text style={styles.halfLabel}>−</Text>
            </Pressable>
          </View>
        )}

        {/* Life total + badges — centred, rotated -90° when in landscape mode */}
        <View style={styles.cellCenter} pointerEvents="box-none">
          <Pressable
            onLongPress={() => openCustomLife(username)}
            delayLongPress={600}
            hitSlop={16}
          >
            <Text style={[
              styles.lifeTotal,
              isDead && styles.lifeDead,
              isCellRotated && styles.lifeTotalLandscape,
            ]}>
              {life}
            </Text>
          </Pressable>
          {isFirst && !isCellRotated && (
            <View style={styles.firstBadge}>
              <Text style={styles.firstBadgeText}>GOES FIRST</Text>
            </View>
          )}
          {cmdMode && cmdDmgTotal > 0 && (
            <Text style={[styles.cmdDmgBadgeText, isCellRotated && { transform: [{ rotate: '-90deg' }] }]}>
              ⚔️ {cmdDmgTotal}
            </Text>
          )}
        </View>

        {/* Rotate button — top right, always */}
        <Pressable
          style={styles.rotateCellBtn}
          onPress={() => { Haptics.selectionAsync(); setCellRotated((prev) => ({ ...prev, [username]: !prev[username] })); }}
        >
          <Text style={styles.rotateCellText}>Rotate</Text>
        </Pressable>

        {/* Commander damage button — mini life counter widget */}
        {cmdMode && (
          <Pressable
            style={styles.cmdBtn}
            onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(username); }}
          >
            <View style={styles.cmdBtnMini}>
              <Text style={styles.cmdBtnMiniLife}>{life}</Text>
              <View style={styles.cmdBtnMiniLine} />
              <Text style={styles.cmdBtnMiniSword}>⚔️</Text>
            </View>
          </Pressable>
        )}
      </View>
    );
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
              style={styles.cmdToggleRow}
              onPress={() => { Haptics.selectionAsync(); setCmdMode((v) => !v); }}
            >
              <View style={[styles.cmdToggle, cmdMode && styles.cmdToggleOn]}>
                <View style={[styles.cmdToggleThumb, cmdMode && styles.cmdToggleThumbOn]} />
              </View>
              <View style={styles.cmdToggleInfo}>
                <Text style={styles.cmdToggleLabel}>Commander Damage Tracking</Text>
                <Text style={styles.cmdToggleHint}>21 from one commander = eliminated</Text>
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
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Set Life Total</Text>
            <Text style={styles.setupLabel}>{customLifeFor}</Text>
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
              <Pressable style={styles.setupStartBtn} onPress={confirmCustomLife}>
                <Text style={styles.setupStartBtnText}>Set</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Commander damage panel ── */}
      {cmdPanelFor && (
        <View style={styles.overlay}>
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>⚔️ Commander Damage</Text>
            <Text style={styles.setupLabel}>{cmdPanelFor} received from:</Text>
            <ScrollView style={styles.cmdScroll} showsVerticalScrollIndicator={false}>
              {players.filter((p) => p.username !== cmdPanelFor).map((attacker) => {
                const pair = cmdDmg[cmdPanelFor]?.[attacker.username] ?? [0, 0];
                const cmd1Dead = pair[0] >= 21;
                const cmd2Dead = pair[1] >= 21;
                const hasSecond = cmdSecondSlot[attacker.username] ?? false;
                const eliminated = cmd1Dead || cmd2Dead;
                return (
                  <View
                    key={attacker.username}
                    style={[styles.cmdAttackerRow, eliminated && styles.cmdAttackerElim]}
                  >
                    <Text style={[styles.cmdAttackerName, eliminated && styles.cmdAttackerNameElim]}>
                      {attacker.username}{eliminated ? '  ☠️' : ''}
                    </Text>

                    {/* Commander 1 — always shown */}
                    <View style={styles.cmdSlotBlock}>
                      <Text style={styles.cmdSlotLabel}>Commander 1</Text>
                      <View style={styles.cmdSlotRow}>
                        <Pressable style={styles.cmdAdjBtn}
                          onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, 0, -1)}>
                          <Text style={styles.cmdAdjBtnText}>−</Text>
                        </Pressable>
                        <Text style={[styles.cmdSlotVal, cmd1Dead && styles.cmdSlotValDead]}>
                          {pair[0]}
                        </Text>
                        <Pressable style={styles.cmdAdjBtn}
                          onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, 0, +1)}>
                          <Text style={styles.cmdAdjBtnText}>+</Text>
                        </Pressable>
                        {cmd1Dead && <Text style={styles.cmdDeadLabel}>ELIM</Text>}
                      </View>
                    </View>

                    {/* Commander 2 — shown only after tapping Add Partner */}
                    {hasSecond ? (
                      <View style={styles.cmdSlotBlock}>
                        <Text style={styles.cmdSlotLabel}>Commander 2 (Partner)</Text>
                        <View style={styles.cmdSlotRow}>
                          <Pressable style={styles.cmdAdjBtn}
                            onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, 1, -1)}>
                            <Text style={styles.cmdAdjBtnText}>−</Text>
                          </Pressable>
                          <Text style={[styles.cmdSlotVal, cmd2Dead && styles.cmdSlotValDead]}>
                            {pair[1]}
                          </Text>
                          <Pressable style={styles.cmdAdjBtn}
                            onPress={() => adjustCmdDmg(cmdPanelFor, attacker.username, 1, +1)}>
                            <Text style={styles.cmdAdjBtnText}>+</Text>
                          </Pressable>
                          {cmd2Dead && <Text style={styles.cmdDeadLabel}>ELIM</Text>}
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.addPartnerBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCmdSecondSlot((prev) => ({ ...prev, [attacker.username]: true }));
                        }}
                      >
                        <Text style={styles.addPartnerBtnText}>＋ Add Partner Commander</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            <Pressable style={styles.setupStartBtn} onPress={() => setCmdPanelFor(null)}>
              <Text style={styles.setupStartBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Winner picker / celebration ── */}
      {showWinnerPicker && (
        <View style={styles.overlay}>
          {pickerPhase === 'winner' ? (
            <View style={styles.setupCard}>
              <Text style={styles.setupTitle}>🏆 Who Won?</Text>
              <Text style={styles.setupLabel}>Select the winner</Text>
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
              <Pressable style={styles.customLifeCancel} onPress={() => setShowWinnerPicker(false)}>
                <Text style={styles.customLifeCancelText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Animated.View style={[styles.setupCard, styles.celebCard, { transform: [{ scale: celebScale }], opacity: celebOpacity }]}>
              <Text style={styles.celebEmoji}>🎉</Text>
              <Text style={styles.setupTitle}>
                {isPickup ? 'Game Over!' : `Round ${group?.roundsPlayed} Complete!`}
              </Text>
              <View style={styles.winnerAnnounce}>
                <Text style={styles.setupLabel}>WINNER</Text>
                <Text style={styles.winnerAnnounceName}>{roundWinner}</Text>
              </View>
              {!isPickup && roundWinner === currentUser?.username && (
                <Text style={styles.celebXP}>+30 Points</Text>
              )}
              <Text style={[styles.setupLabel, { textAlign: 'center', marginBottom: 20 }]}>
                {isPickup
                  ? 'Nice game!'
                  : roundWinner === currentUser?.username ? 'You took it down!' : 'Good game.'}
              </Text>
              {isPickup ? (
                <>
                  <View style={styles.celebBtnRow}>
                    <Pressable style={styles.customLifeCancel} onPress={handlePickupDone}>
                      <Text style={styles.customLifeCancelText}>Done</Text>
                    </Pressable>
                    <Pressable style={styles.setupStartBtn} onPress={handlePlayAgain}>
                      <Text style={styles.setupStartBtnText}>▶ Play Again</Text>
                    </Pressable>
                  </View>
                  <Pressable style={[styles.addPartnerBtn, { marginTop: 10 }]} onPress={handleFormGroup}>
                    <Text style={styles.addPartnerBtnText}>Form a Group to Earn Rewards →</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.celebBtnRow}>
                  <Pressable style={styles.customLifeCancel} onPress={handleEndSession}>
                    <Text style={styles.customLifeCancelText}>End Session</Text>
                  </Pressable>
                  <Pressable style={styles.setupStartBtn} onPress={handlePlayAnotherRound}>
                    <Text style={styles.setupStartBtnText}>▶ Another Round</Text>
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

      {/* ── Centre bar: reset + close + winner trigger ── */}
      <View style={styles.divider}>
        <Pressable style={styles.dividerBtn} onPress={handleReset}>
          <Text style={styles.dividerBtnText}>↺</Text>
        </Pressable>
        <Pressable
          style={styles.winnerBtn}
          onPress={() => { setPickerPhase('winner'); setShowWinnerPicker(true); Haptics.selectionAsync(); }}
        >
          <Text style={styles.winnerBtnText}>🏆</Text>
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

  /* ── Cell ── */
  cell: { flex: 1, position: 'relative', borderWidth: 0.5, borderColor: '#1E1E2A', overflow: 'hidden' },
  cellFlipped: { transform: [{ rotate: '180deg' }] },
  cellFirst: { borderColor: '#FFD700', borderWidth: 1.5 },

  /* Player name bar — absolute, always at physical top of cell */
  nameBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    alignItems: 'center', paddingTop: 6, paddingHorizontal: 40,
  },
  playerName: { fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 0.5 },

  /* +/- half buttons */
  halfCol: { flex: 1, flexDirection: 'column' },
  halfRow: { flex: 1, flexDirection: 'row' },
  halfBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  halfPortPlus: { backgroundColor: '#1A3A1A' },
  halfPortMinus: { backgroundColor: '#3A1A1A' },
  halfLandMinus: { backgroundColor: '#3A1A1A' },
  halfLandPlus: { backgroundColor: '#1A3A1A' },
  halfLabel: { fontSize: 40, color: '#FFF', fontWeight: '200' },

  /* Life total */
  cellCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  lifeTotal: { fontSize: 86, fontWeight: '900', color: '#FFF', lineHeight: 92, textAlign: 'center' },
  lifeTotalLandscape: { transform: [{ rotate: '-90deg' }], fontSize: 72 },
  lifeDead: { color: '#FF3B30' },
  firstBadge: { backgroundColor: '#FFD700', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  firstBadgeText: { fontSize: 10, fontWeight: '900', color: '#000', letterSpacing: 1.5 },
  cmdDmgBadgeText: { fontSize: 12, color: '#FF9090', fontWeight: '700' },

  /* Rotate button */
  rotateCellBtn: {
    position: 'absolute', top: 4, right: 4, zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  rotateCellText: { fontSize: 10, fontWeight: '700', color: '#AAA', letterSpacing: 0.5 },

  /* Commander damage button — mini life counter widget */
  cmdBtn: {
    position: 'absolute', bottom: 8, left: 8, zIndex: 10,
  },
  cmdBtnMini: {
    width: 46, height: 58, backgroundColor: '#0A0A12',
    borderRadius: 8, borderWidth: 1.5, borderColor: '#8B3A3A',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  cmdBtnMiniLife: { fontSize: 14, fontWeight: '900', color: '#FFF', lineHeight: 16 },
  cmdBtnMiniLine: { width: '80%', height: 1, backgroundColor: '#8B3A3A', marginVertical: 4 },
  cmdBtnMiniSword: { fontSize: 14, lineHeight: 16 },

  /* Centre divider bar */
  divider: {
    height: 60, backgroundColor: '#050508', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 14,
    borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#1E1E2A',
  },
  dividerBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#1C1C28',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2C2C3C',
  },
  dividerBtnText: { fontSize: 22, color: '#888' },
  winnerBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#1A1A00',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A5000',
  },
  winnerBtnText: { fontSize: 22 },

  /* ── Overlay shared base ── */
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.90)', alignItems: 'center',
    justifyContent: 'center', zIndex: 99,
  },

  /* Setup card — reused for setup, custom life, commander panel, winner picker */
  setupCard: {
    backgroundColor: '#1C1C24', borderRadius: 24, padding: 24,
    width: '90%', borderWidth: 1, borderColor: '#2C2C3C',
  },
  celebCard: { alignItems: 'center' },
  setupTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 6 },
  setupLabel: {
    fontSize: 11, fontWeight: '700', color: '#888', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 14,
  },

  lifeOptionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  lifeOptionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#111118', borderWidth: 1.5, borderColor: '#2C2C3C',
  },
  lifeOptionBtnActive: { backgroundColor: '#003A00', borderColor: '#34C759' },
  lifeOptionText: { fontSize: 18, fontWeight: '800', color: '#555' },
  lifeOptionTextActive: { color: '#34C759' },

  cmdToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20,
    padding: 14, backgroundColor: '#111118', borderRadius: 14, borderWidth: 1, borderColor: '#2C2C3C',
  },
  cmdToggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#2C2C3C', justifyContent: 'center', paddingHorizontal: 3 },
  cmdToggleOn: { backgroundColor: '#34C759' },
  cmdToggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  cmdToggleThumbOn: { transform: [{ translateX: 20 }] },
  cmdToggleInfo: { flex: 1 },
  cmdToggleLabel: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  cmdToggleHint: { fontSize: 12, color: '#888' },

  setupStartBtn: { backgroundColor: '#34C759', borderRadius: 14, paddingVertical: 16, alignItems: 'center', flex: 1 },
  setupStartBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },

  /* Custom life input */
  customLifeInput: {
    backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#34C759',
    color: '#FFF', fontSize: 36, fontWeight: '900', textAlign: 'center',
    paddingVertical: 12, paddingHorizontal: 20, width: '100%', marginBottom: 20,
  },
  customLifeBtns: { flexDirection: 'row', gap: 10 },
  customLifeCancel: {
    flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    backgroundColor: '#2C2C38',
  },
  customLifeCancelText: { color: '#888', fontWeight: '700', fontSize: 16 },

  /* Commander damage panel */
  cmdScroll: { maxHeight: 320, marginBottom: 14 },
  cmdAttackerRow: {
    backgroundColor: '#111118', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#2C2C3C',
  },
  cmdAttackerElim: { borderColor: '#FF3B30', backgroundColor: '#1F0808' },
  cmdAttackerName: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  cmdAttackerNameElim: { color: '#FF3B30' },
  cmdSlotBlock: { marginBottom: 10 },
  cmdSlotLabel: { fontSize: 10, color: '#666', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  cmdSlotRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cmdAdjBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#2C2C3C',
    alignItems: 'center', justifyContent: 'center',
  },
  cmdAdjBtnText: { fontSize: 20, color: '#FFF', fontWeight: '200' },
  cmdSlotVal: { fontSize: 26, fontWeight: '900', color: '#FFF', minWidth: 40, textAlign: 'center' },
  cmdSlotValDead: { color: '#FF3B30' },
  cmdDeadLabel: {
    fontSize: 9, fontWeight: '800', color: '#FF3B30', backgroundColor: '#3A0808',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, letterSpacing: 1,
  },
  addPartnerBtn: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#3C2C4C', backgroundColor: '#180A28',
    alignItems: 'center',
  },
  addPartnerBtnText: { fontSize: 12, color: '#9B7FBF', fontWeight: '700' },

  /* Winner picker */
  celebEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  celebXP: { fontSize: 36, fontWeight: '800', color: '#34C759', textAlign: 'center', marginBottom: 8 },
  celebBtnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  winnerOption: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111118',
    borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2C2C38',
  },
  winnerAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#2C2C38',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  winnerInitial: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  winnerName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFF' },
  winnerYouTag: { backgroundColor: '#007AFF', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  winnerYouText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  winnerAnnounce: { alignItems: 'center', backgroundColor: '#111118', borderRadius: 12, padding: 14, marginVertical: 10, width: '100%' },
  winnerAnnounceName: { fontSize: 26, fontWeight: '900', color: '#FFF' },
});
