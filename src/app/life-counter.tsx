import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MENU_H = 44;
const GAP = 8;
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
 * Each player occupies their own bordered counter box; the menu bar sits between
 * the two boxes as a standalone screen-level element, not part of either counter.
 * The commander damage overlay orients to match the player who opened it (180° for
 * the top player who reads their counter flipped, 0° for the bottom player).
 * Partner status is toggled via an explicit visible Partner button at the bottom
 * of each counter, which also gates the Cmd 1 / Cmd 2 split in the overlay.
 * cmdDmg[victim][attacker] = [cmd1, cmd2] tracks per-commander damage; any single
 * slot reaching 21 eliminates the victim.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life totals are unbounded below; Reset restores START_LIFE and clears
 * all commander damage; hold interval is always cleared on PressOut.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [content, setContent] = useState({ w: 0, h: 0 });
  const [players, setPlayers] = useState<Player[]>(makeInitialPlayers());
  const [cmdDmg, setCmdDmg] = useState<Record<number, Record<number, [number, number]>>>({});
  const [cmdPanelFor, setCmdPanelFor] = useState<number | null>(null);
  const [activeCmd, setActiveCmd] = useState<Record<number, 0 | 1>>({});
  const interval0 = useRef<ReturnType<typeof setInterval> | null>(null);
  const interval1 = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervals: IntervalRef[] = [interval0, interval1];

  const onContentLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContent({ w: width, h: height });
  };

  // Height of each counter box: total content area minus menu bar and two gaps
  const halfH = content.h > 0 ? (content.h - MENU_H - 2 * GAP) / 2 : 0;

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

  // ─── Render one player's counter box ──────────────────────────────────────
  const renderCounter = (playerIdx: number, isTop: boolean, interval: IntervalRef) => {
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
      isLandscape && content.w > 0 && halfH > 0
        ? {
            position: 'absolute' as const,
            width: halfH, height: content.w,
            top: (halfH - content.w) / 2,
            left: (content.w - halfH) / 2,
            transform: [{ rotate: rotateAngle! }],
          }
        : rotateAngle
        ? { flex: 1, transform: [{ rotate: rotateAngle }] }
        : { flex: 1 };

    return (
      <View style={styles.counterBox}>
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

          {/* Life total — non-interactive overlay */}
          <View style={styles.lifeOverlay} pointerEvents="none">
            <Text style={[styles.lifeText, elim && styles.lifeTextDead]}>{life}</Text>
            {elim && <Text style={styles.eliminatedLabel}>ELIMINATED</Text>}
          </View>

          {/* Player name at reading-top */}
          <View style={styles.playerNameBadge} pointerEvents="none">
            <Text style={styles.playerNameText} numberOfLines={1}>{name}</Text>
          </View>

          {/* Rotate button — top/right of inner */}
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

          {/* Bottom bar: commander damage button + explicit partner toggle */}
          <View style={styles.bottomBar}>
            <Pressable
              style={styles.cmdBtn}
              onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(playerIdx); }}
            >
              <Text style={styles.cmdBtnIcon}>⚔</Text>
              {cmdTotal > 0 && (
                <View style={styles.cmdTotalBadge}>
                  <Text style={styles.cmdTotalText}>{cmdTotal}</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={[styles.partnerToggle, hasPartner && styles.partnerToggleOn]}
              onPress={() => togglePartner(playerIdx)}
            >
              <View style={[styles.partnerCheck, hasPartner && styles.partnerCheckOn]}>
                {hasPartner && <Text style={styles.partnerCheckMark}>✓</Text>}
              </View>
              <Text style={[styles.partnerToggleText, hasPartner && styles.partnerToggleTextOn]}>
                Partner
              </Text>
            </Pressable>
          </View>

        </View>
      </View>
    );
  };

  // ─── Commander damage overlay ─────────────────────────────────────────────
  const renderCmdOverlay = () => {
    if (cmdPanelFor === null) return null;
    const victim = cmdPanelFor;
    // Panel rotates to match the opening player's reading orientation
    const panelRotation = victim === 0 ? '180deg' : '0deg';

    return (
      <View style={styles.cmdOverlay}>
        <View style={[styles.cmdPanel, { transform: [{ rotate: panelRotation }] }]}>
          <Text style={styles.cmdPanelTitle}>{players[victim].name}</Text>
          <Text style={styles.cmdPanelSub}>Commander Damage Received</Text>

          {players.map((attacker, attackerIdx) => {
            if (attackerIdx === victim) return null;
            const slot = activeCmd[attackerIdx] ?? 0;
            const dmg = getCmdVal(victim, attackerIdx, slot);
            const elim = dmg >= 21;

            return (
              <View key={attackerIdx} style={styles.cmdSection}>
                <View style={styles.cmdSectionHeader}>
                  <Text style={styles.cmdAttackerName}>{attacker.name}</Text>
                  {elim && (
                    <View style={styles.cmdElimBadge}>
                      <Text style={styles.cmdElimBadgeText}>ELIMINATED</Text>
                    </View>
                  )}
                </View>

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
        {/*
          contentArea holds the two counter boxes and the menu bar as siblings.
          The overlay is absolutely positioned inside it to cover all three.
        */}
        <View style={styles.contentArea} onLayout={onContentLayout}>

          {renderCounter(0, true, intervals[0])}

          <View style={styles.menuBar}>
            <Pressable style={styles.menuBtn} onPress={() => { Haptics.selectionAsync(); router.back(); }}>
              <Text style={styles.menuBtnText}>‹</Text>
            </Pressable>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </Pressable>
            <View style={styles.menuBtn} />
          </View>

          {renderCounter(1, false, intervals[1])}

          {renderCmdOverlay()}

        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0F' },
  screen: { flex: 1, padding: 20, backgroundColor: '#0A0A0F' },

  // Wrapper that holds both counter boxes + menu bar; overlay is absolute inside it
  contentArea: {
    flex: 1,
    flexDirection: 'column',
    gap: GAP,
  },

  // ── Each counter is its own independent bordered box ──
  counterBox: {
    flex: 1,
    backgroundColor: '#111118',
    borderWidth: 2,
    borderColor: '#3C3C5C',
    borderRadius: 16,
    overflow: 'hidden',
  },
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

  playerNameBadge: {
    position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center',
  },
  playerNameText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  rotateBtn: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rotateBtnText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  // ── Bottom bar: commander damage btn + partner toggle ──
  bottomBar: {
    position: 'absolute', bottom: 12, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
  },

  // Commander damage button — 300% of original (18px → 54px icon), bordered
  cmdBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  cmdBtnIcon: { fontSize: 54, color: 'rgba(255,255,255,0.75)' },
  cmdTotalBadge: {
    backgroundColor: 'rgba(224,85,85,0.25)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1,
  },
  cmdTotalText: { fontSize: 12, color: '#E05555', fontWeight: '600' },

  // Explicit partner toggle button with checkbox visual
  partnerToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  partnerToggleOn: {
    borderColor: '#6FC96F',
    backgroundColor: 'rgba(111,201,111,0.1)',
  },
  partnerCheck: {
    width: 17, height: 17, borderRadius: 4,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  partnerCheckOn: { borderColor: '#6FC96F', backgroundColor: '#6FC96F' },
  partnerCheckMark: { fontSize: 10, color: '#000', fontWeight: '800' },
  partnerToggleText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  partnerToggleTextOn: { color: '#6FC96F' },

  // ── Menu bar — standalone element between the two counter boxes ──
  menuBar: {
    height: MENU_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#0D0D18',
    borderRadius: 12,
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
  // Panel has its own strong border; rotated to match the opening player's orientation
  cmdPanel: {
    width: '92%',
    backgroundColor: '#181825',
    borderRadius: 20,
    borderWidth: 2, borderColor: '#5A5A8A',
    padding: 24,
  },
  cmdPanelTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  cmdPanelSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center',
    marginTop: 2, marginBottom: 20, letterSpacing: 0.5,
  },

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

  cmdSlotRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  cmdSlotBtn: {
    flex: 1, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  cmdSlotBtnOn: { backgroundColor: 'rgba(108,99,255,0.25)', borderColor: '#6C63FF' },
  cmdSlotBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  cmdSlotBtnTextOn: { color: '#A09CF7', fontWeight: '700' },

  cmdCounterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cmdCounterBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
  },
  cmdCounterBtnText: { fontSize: 28, color: '#FFFFFF', fontWeight: '200' },
  cmdCounterVal: { width: 80, textAlign: 'center', fontSize: 44, fontWeight: '200', color: '#FFFFFF' },
  cmdCounterValElim: { color: '#E05555' },

  cmdCloseBtn: {
    marginTop: 8, paddingVertical: 12,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  cmdCloseBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
});
