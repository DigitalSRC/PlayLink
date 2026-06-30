import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MENU_H = 48;
const START_LIFE = 40;

interface Player {
  name: string;
  life: number;
  isLandscape: boolean;
  hasPartner: boolean;
}

type IntervalRef = React.MutableRefObject<ReturnType<typeof setInterval> | null>;

const makeInitialPlayers = (): Player[] => [
  { name: 'Player 1', life: START_LIFE, isLandscape: false, hasPartner: false },
  { name: 'Player 2', life: START_LIFE, isLandscape: false, hasPartner: false },
];

/**
 * Two-player life counter with commander damage tracking.
 * Each half shows the player's name at their reading-top, life total at centre,
 * a Rotate button at their reading-top-right, and a commander damage button at
 * their reading-bottom-centre. All of these are nested inside the rotating inner
 * so every element transforms together.
 * cmdDmg[victim][attacker] = [cmd1, cmd2] — commander damage dealt to victim by
 * attacker's first and second commander respectively. Any single slot reaching 21
 * eliminates the victim regardless of their remaining life total.
 * Adjusting commander damage also subtracts from the victim's life total.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life totals are unbounded below; Reset restores everything to START_LIFE
 * and clears all commander damage; hold interval is always cleared on PressOut.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [players, setPlayers] = useState<Player[]>(makeInitialPlayers());
  // cmdDmg[victimIdx][attackerIdx] = [cmd1Dmg, cmd2Dmg]
  const [cmdDmg, setCmdDmg] = useState<Record<number, Record<number, [number, number]>>>({});
  const [cmdPanelFor, setCmdPanelFor] = useState<number | null>(null);
  // Which commander slot is active per attacker in the overlay (0 = Cmd 1, 1 = Cmd 2)
  const [activeCmd, setActiveCmd] = useState<Record<number, 0 | 1>>({});
  const interval0 = useRef<ReturnType<typeof setInterval> | null>(null);
  const interval1 = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervals: IntervalRef[] = [interval0, interval1];

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  };

  const halfH = canvas.h > 0 ? (canvas.h - MENU_H) / 2 : 0;

  const updateLife = (idx: number, delta: number) =>
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, life: p.life + delta } : p));

  const getCmdVal = (victim: number, attacker: number, slot: 0 | 1): number =>
    cmdDmg[victim]?.[attacker]?.[slot] ?? 0;

  const getCmdTotal = (victim: number): number =>
    Object.values(cmdDmg[victim] ?? {}).reduce((s, [c1, c2]) => s + c1 + c2, 0);

  const isEliminated = (idx: number): boolean => {
    if (players[idx].life <= 0) return true;
    return Object.values(cmdDmg[idx] ?? {}).some(([c1, c2]) => c1 >= 21 || c2 >= 21);
  };

  /**
   * Adjusts commander damage for one attacker-slot pair and mirrors the delta
   * onto the victim's main life total. Clamps each slot at 0.
   * Parameters: victim index, attacker index, slot (0/1), delta.
   * Returns: void.
   * Edge cases: no-ops when the clamped actualDelta is 0.
   */
  const adjustCmdDmg = (victim: number, attacker: number, slot: 0 | 1, delta: number) => {
    Haptics.impactAsync(
      Math.abs(delta) >= 10 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    const current = getCmdVal(victim, attacker, slot);
    const newVal = Math.max(0, current + delta);
    const actualDelta = newVal - current;
    if (actualDelta === 0) return;
    setCmdDmg(prev => {
      const vm = { ...(prev[victim] ?? {}) };
      const pair: [number, number] = [...(vm[attacker] ?? [0, 0])] as [number, number];
      pair[slot] = newVal;
      vm[attacker] = pair;
      return { ...prev, [victim]: vm };
    });
    updateLife(victim, -actualDelta);
  };

  const togglePartner = (idx: number) => {
    Haptics.selectionAsync();
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, hasPartner: !p.hasPartner } : p));
  };

  const reset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPlayers(makeInitialPlayers());
    setCmdDmg({});
    setCmdPanelFor(null);
    setActiveCmd({});
  };

  // ─── Render one player's half ─────────────────────────────────────────────
  const renderHalf = (playerIdx: number, isTop: boolean, interval: IntervalRef) => {
    const { name, life, isLandscape, hasPartner } = players[playerIdx];
    const elim = isEliminated(playerIdx);
    const cmdTotal = getCmdTotal(playerIdx);

    const startHold = (delta: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateLife(playerIdx, delta);
      interval.current = setInterval(() => updateLife(playerIdx, delta), 150);
    };
    const stopHold = () => {
      if (interval.current !== null) { clearInterval(interval.current); interval.current = null; }
    };

    const rotateAngle = isLandscape
      ? (isTop ? '270deg' : '90deg')
      : (isTop ? '180deg' : null);

    const innerStyle: object =
      isLandscape && canvas.w > 0 && halfH > 0
        ? {
            position: 'absolute' as const,
            width: halfH, height: canvas.w,
            top: (halfH - canvas.w) / 2,
            left: (canvas.w - halfH) / 2,
            transform: [{ rotate: rotateAngle! }],
          }
        : rotateAngle
        ? { flex: 1, transform: [{ rotate: rotateAngle }] }
        : { flex: 1 };

    return (
      <View style={styles.half}>
        <View style={[styles.inner, innerStyle]}>

          {/* +/− tap zones */}
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateLife(playerIdx, 1); }}
            onLongPress={() => startHold(10)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>+</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateLife(playerIdx, -1); }}
            onLongPress={() => startHold(-10)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>−</Text>
          </Pressable>

          {/* Life total + eliminated state — non-interactive overlay */}
          <View style={styles.lifeOverlay} pointerEvents="none">
            <Text style={[styles.lifeText, elim && styles.lifeTextDead]}>{life}</Text>
            {elim && <Text style={styles.eliminatedLabel}>ELIMINATED</Text>}
          </View>

          {/* Player name at reading-top — nested so it rotates with the inner */}
          <View style={styles.playerNameBadge} pointerEvents="none">
            <Text style={styles.playerNameText} numberOfLines={1}>{name}</Text>
          </View>

          {/* Rotate — top/right of inner; transform carries it to player's visual top-right */}
          <Pressable
            style={styles.rotateBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setPlayers(prev => prev.map((p, i) =>
                i === playerIdx ? { ...p, isLandscape: !p.isLandscape } : p,
              ));
            }}
          >
            <Text style={styles.rotateBtnText}>Rotate</Text>
          </Pressable>

          {/* Commander damage button — bottom-centre of inner.
              Short press opens overlay. Long press toggles partner commander. */}
          <Pressable
            style={[styles.cmdBtn, hasPartner && styles.cmdBtnPartner]}
            onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(playerIdx); }}
            onLongPress={() => togglePartner(playerIdx)}
            delayLongPress={600}
          >
            <Text style={styles.cmdBtnIcon}>⚔</Text>
            {hasPartner && <Text style={styles.cmdPartnerMark}>✓</Text>}
            {cmdTotal > 0 && (
              <View style={styles.cmdTotalBadge}>
                <Text style={styles.cmdTotalText}>{cmdTotal}</Text>
              </View>
            )}
          </Pressable>

        </View>
      </View>
    );
  };

  // ─── Commander damage overlay ─────────────────────────────────────────────
  const renderCmdOverlay = () => {
    if (cmdPanelFor === null) return null;
    const victim = cmdPanelFor;

    return (
      <View style={styles.cmdOverlay}>
        <View style={styles.cmdPanel}>
          <Text style={styles.cmdPanelTitle}>{players[victim].name}</Text>
          <Text style={styles.cmdPanelSub}>Commander Damage Received</Text>

          {players.map((attacker, attackerIdx) => {
            if (attackerIdx === victim) return null;
            const slot = activeCmd[attackerIdx] ?? 0;
            const dmg = getCmdVal(victim, attackerIdx, slot);
            const elim = dmg >= 21;

            return (
              <View key={attackerIdx} style={styles.cmdSection}>
                {/* Attacker header */}
                <View style={styles.cmdSectionHeader}>
                  <Text style={styles.cmdAttackerName}>{attacker.name}</Text>
                  {elim && (
                    <View style={styles.cmdElimBadge}>
                      <Text style={styles.cmdElimBadgeText}>ELIMINATED</Text>
                    </View>
                  )}
                </View>

                {/* Cmd 1 / Cmd 2 slot toggle — only when attacker has a partner */}
                {attacker.hasPartner && (
                  <View style={styles.cmdSlotRow}>
                    {([0, 1] as const).map(s => (
                      <Pressable
                        key={s}
                        style={[styles.cmdSlotBtn, slot === s && styles.cmdSlotBtnOn]}
                        onPress={() => { Haptics.selectionAsync(); setActiveCmd(prev => ({ ...prev, [attackerIdx]: s })); }}
                      >
                        <Text style={[styles.cmdSlotBtnText, slot === s && styles.cmdSlotBtnTextOn]}>
                          {s === 0 ? 'Cmd 1' : 'Cmd 2'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Counter row — large +/− with damage total in centre */}
                <View style={styles.cmdCounterRow}>
                  <Pressable
                    style={styles.cmdCounterBtn}
                    onPress={() => adjustCmdDmg(victim, attackerIdx, slot, -1)}
                    onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, -10)}
                  >
                    <Text style={styles.cmdCounterBtnText}>−</Text>
                  </Pressable>
                  <Text style={[styles.cmdCounterVal, elim && styles.cmdCounterValElim]}>
                    {dmg}
                  </Text>
                  <Pressable
                    style={styles.cmdCounterBtn}
                    onPress={() => adjustCmdDmg(victim, attackerIdx, slot, 1)}
                    onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, 10)}
                  >
                    <Text style={styles.cmdCounterBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Pressable
            style={styles.cmdCloseBtn}
            onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(null); }}
          >
            <Text style={styles.cmdCloseBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.canvas} onLayout={onCanvasLayout}>

          {renderHalf(0, true, intervals[0])}

          <View style={styles.menuBar}>
            <Pressable style={styles.menuBtn} onPress={() => { Haptics.selectionAsync(); router.back(); }}>
              <Text style={styles.menuBtnText}>‹</Text>
            </Pressable>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </Pressable>
            <View style={styles.menuBtn} />
          </View>

          {renderHalf(1, false, intervals[1])}

          {renderCmdOverlay()}

        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0F' },
  screen: { flex: 1, padding: 20 },
  canvas: {
    flex: 1,
    backgroundColor: '#111118',
    borderWidth: 2,
    borderColor: '#3C3C5C',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
  },

  // ── Counter half ──
  half: { flex: 1, overflow: 'hidden' },
  inner: { flexDirection: 'column' },
  zone: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  zoneActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  zoneSymbol: { fontSize: 60, color: 'rgba(255,255,255,0.28)', fontWeight: '100' },

  lifeOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  lifeText: { fontSize: 80, fontWeight: '200', color: '#FFFFFF', includeFontPadding: false },
  lifeTextDead: { color: 'rgba(255,255,255,0.3)' },
  eliminatedLabel: { fontSize: 11, fontWeight: '600', color: '#E05555', letterSpacing: 1.5, marginTop: 4 },

  // Player name — at reading-top of the inner, centred, non-interactive
  playerNameBadge: {
    position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center',
  },
  playerNameText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  // Rotate button — top/right of inner
  rotateBtn: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rotateBtnText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  // Commander damage button — bottom-centre of inner
  cmdBtn: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    paddingVertical: 6,
  },
  cmdBtnPartner: {},
  cmdBtnIcon: { fontSize: 18, color: 'rgba(255,255,255,0.45)' },
  cmdPartnerMark: { fontSize: 12, color: '#6FC96F', fontWeight: '700' },
  cmdTotalBadge: {
    backgroundColor: 'rgba(224,85,85,0.25)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
  },
  cmdTotalText: { fontSize: 11, color: '#E05555', fontWeight: '600' },

  // ── Menu bar ──
  menuBar: {
    height: MENU_H, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#2A2A3A',
    backgroundColor: '#0D0D18',
  },
  menuBtn: { width: 44, height: 36, justifyContent: 'center', alignItems: 'center' },
  menuBtnText: { fontSize: 22, color: 'rgba(255,255,255,0.5)' },
  resetBtn: {
    paddingHorizontal: 20, paddingVertical: 8,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)',
  },
  resetBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },

  // ── Commander damage overlay ──
  cmdOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(5,5,12,0.92)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 50,
  },
  cmdPanel: {
    width: '88%',
    backgroundColor: '#181825',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3C3C5C',
    padding: 24,
  },
  cmdPanelTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  cmdPanelSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center',
    marginTop: 2, marginBottom: 20, letterSpacing: 0.5,
  },

  // Each attacker section inside the panel
  cmdSection: {
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, padding: 16,
  },
  cmdSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cmdAttackerName: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  cmdElimBadge: {
    backgroundColor: 'rgba(224,85,85,0.2)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  cmdElimBadgeText: { fontSize: 10, fontWeight: '700', color: '#E05555', letterSpacing: 1 },

  // Cmd 1 / Cmd 2 toggle (partner only)
  cmdSlotRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  cmdSlotBtn: {
    flex: 1, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  cmdSlotBtnOn: { backgroundColor: 'rgba(108,99,255,0.25)', borderColor: '#6C63FF' },
  cmdSlotBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  cmdSlotBtnTextOn: { color: '#A09CF7', fontWeight: '700' },

  // +/−/value counter row
  cmdCounterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cmdCounterBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
  },
  cmdCounterBtnText: { fontSize: 28, color: '#FFFFFF', fontWeight: '200' },
  cmdCounterVal: { width: 80, textAlign: 'center', fontSize: 44, fontWeight: '200', color: '#FFFFFF' },
  cmdCounterValElim: { color: '#E05555' },

  // Close button
  cmdCloseBtn: {
    marginTop: 8, paddingVertical: 12,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  cmdCloseBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
});
