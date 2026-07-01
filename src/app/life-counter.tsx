import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MENU_H = 44;
const GAP = 8;
const START_LIFE = 40;

// Long-press hold tuning: each tick moves life by exactly 1 (fine control, no overshoot).
// The first repeat waits as long as the initial long-press threshold did, then each
// subsequent wait shrinks by HOLD_ACCEL (exponential speedup), floored at HOLD_MIN_DELAY.
const HOLD_TICK_STEP = 1;
const HOLD_INITIAL_DELAY = 400; // matches Pressable's delayLongPress
const HOLD_MIN_DELAY = 40;
const HOLD_ACCEL = 0.82;

// Extremely faint − (red) → center (white) → + (green) fill, banded as flat-color
// strips since React Native has no built-in gradient primitive.
const GRADIENT_BANDS = 20;
const GRADIENT_ALPHA = 0.028;
const GRADIENT_RED: [number, number, number] = [255, 70, 70];
const GRADIENT_WHITE: [number, number, number] = [255, 255, 255];
const GRADIENT_GREEN: [number, number, number] = [70, 220, 120];
const lerpChannel = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const lerpColor = (
  c1: [number, number, number], c2: [number, number, number], t: number,
): [number, number, number] => [
  lerpChannel(c1[0], c2[0], t), lerpChannel(c1[1], c2[1], t), lerpChannel(c1[2], c2[2], t),
];
const GRADIENT_BAND_COLORS: string[] = Array.from({ length: GRADIENT_BANDS }, (_, i) => {
  const t = i / (GRADIENT_BANDS - 1);
  const [r, g, b] = t <= 0.5
    ? lerpColor(GRADIENT_RED, GRADIENT_WHITE, t / 0.5)
    : lerpColor(GRADIENT_WHITE, GRADIENT_GREEN, (t - 0.5) / 0.5);
  return `rgba(${r},${g},${b},${GRADIENT_ALPHA})`;
});

interface Player {
  name: string;
  life: number;
  isLandscape: boolean;
  hasPartner: boolean;
}

type IntervalRef = React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

const makeInitialPlayers = (): Player[] => [
  { name: 'Player 1', life: START_LIFE, isLandscape: false, hasPartner: false },
  { name: 'Player 2', life: START_LIFE, isLandscape: false, hasPartner: false },
];

/**
 * Two-player life counter with commander damage tracking.
 * Each player occupies their own bordered counter box. The inner is flexDirection row
 * so − sits on the left and + on the right from the player's reading perspective;
 * rotation transforms preserve this for all orientations. The Partner checkbox lives
 * at the inner's top-left (nested so it transforms with the counter). The commander
 * damage button is a static square centered just below the life total — it never
 * resizes and never displays a damage total. Pressing it opens a square popup panel
 * centered on screen; the panel is rotated to match the orientation of the counter
 * that opened it, so the (Self) row always reads in that same orientation.
 * cmdDmg[victim][attacker] = [cmd1, cmd2]; any single slot ≥ 21 eliminates the victim.
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
  const interval0 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervals: IntervalRef[] = [interval0, interval1];

  const onContentLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContent({ w: width, h: height });
  };

  const halfH = content.h > 0 ? (content.h - MENU_H - 2 * GAP) / 2 : 0;

  const updateLife = (idx: number, delta: number) =>
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, life: p.life + delta } : p));

  const getCmdVal = (victim: number, attacker: number, slot: 0 | 1): number =>
    cmdDmg[victim]?.[attacker]?.[slot] ?? 0;

  const isEliminated = (idx: number): boolean => {
    if (players[idx].life <= 0) return true;
    return Object.entries(cmdDmg[idx] ?? {}).some(
      ([k, [c1, c2]]) => Number(k) !== idx && (c1 >= 21 || c2 >= 21),
    );
  };

  /**
   * Adjusts commander damage for one attacker-slot pair and mirrors the delta
   * onto the victim's main life total. Clamps each slot at 0.
   * Parameters: victim index, attacker index, slot (0/1), delta.
   * Returns: void.
   * Edge cases: no-ops when the clamped actualDelta is 0.
   */
  // skipLife=true for self-damage rows so own-commander hits don't deduct from life total
  const adjustCmdDmg = (victim: number, attacker: number, slot: 0 | 1, delta: number, skipLife = false) => {
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
    if (!skipLife) updateLife(victim, -actualDelta);
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

  /**
   * Returns the visual rotation angle for a player's counter based on position and landscape state.
   * Parameters: playerIdx — array index; isTop — whether this player occupies the top half.
   * Returns: a rotation string ('0deg', '90deg', '180deg', '270deg').
   * Edge cases: returns '0deg' for the bottom player in portrait (no transform applied).
   */
  const getPlayerAngle = (playerIdx: number, isTop: boolean): string => {
    const { isLandscape } = players[playerIdx];
    if (isLandscape) return isTop ? '270deg' : '90deg';
    return isTop ? '180deg' : '0deg';
  };

  // ─── Render one player's counter box ──────────────────────────────────────
  const renderCounter = (playerIdx: number, isTop: boolean, interval: IntervalRef) => {
    const { name, life, isLandscape, hasPartner } = players[playerIdx];
    const elim = isEliminated(playerIdx);
    const rotateAngle = getPlayerAngle(playerIdx, isTop);

    // First tick fires with the long press itself; the next tick waits the same
    // HOLD_INITIAL_DELAY before repeating, then each wait shrinks by HOLD_ACCEL so
    // the repeat rate ramps up the longer the hold continues.
    const startHold = (direction: 1 | -1) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateLife(playerIdx, direction * HOLD_TICK_STEP);
      let wait = HOLD_INITIAL_DELAY;
      const tick = () => {
        updateLife(playerIdx, direction * HOLD_TICK_STEP);
        wait = Math.max(HOLD_MIN_DELAY, wait * HOLD_ACCEL);
        interval.current = setTimeout(tick, wait);
      };
      interval.current = setTimeout(tick, wait);
    };
    const stopHold = () => {
      if (interval.current !== null) { clearTimeout(interval.current); interval.current = null; }
    };

    // Portrait non-top: no transform; portrait top: 180°; landscape: 90°/270°
    const angleOrNull = rotateAngle === '0deg' ? null : rotateAngle;
    const innerStyle: object =
      isLandscape && content.w > 0 && halfH > 0
        ? {
            position: 'absolute' as const,
            width: halfH, height: content.w,
            top: (halfH - content.w) / 2,
            left: (content.w - halfH) / 2,
            transform: [{ rotate: rotateAngle }],
          }
        : angleOrNull
        ? { flex: 1, transform: [{ rotate: angleOrNull }] }
        : { flex: 1 };

    return (
      <View style={styles.counterBox}>
        <View style={[styles.inner, innerStyle]}>

          {/* Extremely faint − (red) → center (white) → + (green) fill */}
          <View style={styles.gradientOverlay} pointerEvents="none">
            {GRADIENT_BAND_COLORS.map((color, i) => (
              <View key={i} style={[styles.gradientBand, { backgroundColor: color }]} />
            ))}
          </View>

          {/* LEFT zone: − */}
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateLife(playerIdx, -1); }}
            onLongPress={() => startHold(-1)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>−</Text>
          </Pressable>

          {/* RIGHT zone: + */}
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateLife(playerIdx, 1); }}
            onLongPress={() => startHold(1)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>+</Text>
          </Pressable>

          {/* Life total — non-interactive centered overlay */}
          <View style={styles.lifeOverlay} pointerEvents="none">
            <Text style={[styles.lifeText, elim && styles.lifeTextDead]}>{life}</Text>
            {elim && <Text style={styles.eliminatedLabel}>ELIMINATED</Text>}
          </View>

          {/* Player name — centered at inner top */}
          <View style={styles.playerNameBadge} pointerEvents="none">
            <Text style={styles.playerNameText} numberOfLines={1}>{name}</Text>
          </View>

          {/* Rotate button — inner top-right */}
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

          {/* Partner toggle — inner top-left, nested so it rotates with the counter */}
          <Pressable
            style={[styles.partnerToggle, hasPartner && styles.partnerToggleOn]}
            onPress={() => togglePartner(playerIdx)}
          >
            <View style={[styles.partnerCheck, hasPartner && styles.partnerCheckOn]}>
              {hasPartner && <Text style={styles.partnerCheckMark}>✓</Text>}
            </View>
            <Text style={[styles.partnerToggleText, hasPartner && styles.partnerToggleTextOn]}>P</Text>
          </Pressable>

          {/* Commander damage button — static square, never shows damage totals */}
          <View style={styles.cmdArea} pointerEvents="box-none">
            <Pressable
              style={styles.cmdBtn}
              onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(playerIdx); }}
            >
              <Text style={styles.cmdBtnIcon}>⚔</Text>
            </Pressable>
          </View>

        </View>
      </View>
    );
  };

  // ─── Commander damage overlay ─────────────────────────────────────────────
  // Panel is a fixed-size square, centered on screen via cmdOverlay's flex centering.
  // The inner content view rotates to face the player who opened it (same technique
  // as renderCounter). Tapping the dimmed backdrop closes the overlay; tapping inside
  // the panel is consumed by the inner Pressable, preventing backdrop dismissal.
  const renderCmdOverlay = () => {
    if (cmdPanelFor === null) return null;
    const victim = cmdPanelFor;
    const panelAngle = getPlayerAngle(victim, victim === 0);
    const isLandscapePanel = panelAngle === '90deg' || panelAngle === '270deg';

    // Square panel, sized to fit within whichever screen dimension is smaller
    const PANEL_SIZE = Math.min(content.w, content.h) * 0.82;
    const PANEL_W = PANEL_SIZE;
    const PANEL_H = PANEL_SIZE;

    // Inner content rotates to face the opening player — the same getPlayerAngle
    // used for that player's own life-total box, so the (Self) row always reads
    // in the same orientation as their own counter.
    const innerStyle: object = isLandscapePanel
      ? {
          position: 'absolute' as const,
          width: PANEL_H, height: PANEL_W,
          top: (PANEL_H - PANEL_W) / 2,
          left: (PANEL_W - PANEL_H) / 2,
          transform: [{ rotate: panelAngle }],
          padding: 16,
        }
      : panelAngle === '0deg'
      ? { flex: 1, padding: 16 }
      : { flex: 1, padding: 16, transform: [{ rotate: panelAngle }] };

    // isSelf=true: own-commander damage — never eliminates, never deducts life.
    const renderSection = (attackerIdx: number, isSelf: boolean) => {
      const slot = (activeCmd[attackerIdx] ?? 0) as 0 | 1;
      const dmg = getCmdVal(victim, attackerIdx, slot);
      const elim = !isSelf && dmg >= 21;
      const label = isSelf ? `${players[victim].name} (Self)` : players[attackerIdx].name;
      const showPartnerToggle = players[attackerIdx].hasPartner;

      return (
        <View key={`s-${attackerIdx}`} style={styles.cmdSection}>
          <View style={styles.cmdSectionHeader}>
            <Text style={styles.cmdAttackerName}>{label}</Text>
            {elim && (
              <View style={styles.cmdElimBadge}>
                <Text style={styles.cmdElimBadgeText}>ELIMINATED</Text>
              </View>
            )}
          </View>

          {showPartnerToggle && (
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

          {/* Half-zone counter: left half = −, right half = +, value overlaid */}
          <View style={styles.cmdCounterBox}>
            <Pressable
              style={styles.cmdHalfZone}
              onPress={() => adjustCmdDmg(victim, attackerIdx, slot, -1, isSelf)}
              onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, -10, isSelf)}
              delayLongPress={400}
            />
            <Pressable
              style={styles.cmdHalfZone}
              onPress={() => adjustCmdDmg(victim, attackerIdx, slot, 1, isSelf)}
              onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, 10, isSelf)}
              delayLongPress={400}
            />
            <View pointerEvents="none" style={styles.cmdValOverlay}>
              <Text style={[styles.cmdValText, elim && styles.cmdValTextElim]}>{dmg}</Text>
            </View>
          </View>
        </View>
      );
    };

    return (
      <Pressable
        style={styles.cmdOverlay}
        onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(null); }}
      >
        <Pressable style={[styles.cmdPanel, { width: PANEL_W, height: PANEL_H }]}>
          <View style={innerStyle}>
            <Text style={styles.cmdPanelTitle}>{players[victim].name}</Text>
            <Text style={styles.cmdPanelSub}>Commander Damage Received</Text>
            {renderSection(victim, true)}
            {players.map((_, attackerIdx) => {
              if (attackerIdx === victim) return null;
              return renderSection(attackerIdx, false);
            })}
          </View>
        </Pressable>
      </Pressable>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
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
  contentArea: { flex: 1, flexDirection: 'column', gap: GAP },

  // ── Each counter is its own independent bordered box ──
  counterBox: {
    flex: 1,
    backgroundColor: '#111118',
    borderWidth: 2, borderColor: '#3C3C5C', borderRadius: 16,
    overflow: 'hidden',
  },
  // Row direction: left zone = −, right zone = +; rotations preserve this for all orientations
  inner: { flexDirection: 'row' },
  // Sits behind the zones/text as an inert banded fill; rotates with `inner` so red always
  // lands on the reading-left (−) side and green on the reading-right (+) side.
  gradientOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
  },
  gradientBand: { flex: 1 },
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

  // Rotate — inner top-right
  rotateBtn: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rotateBtnText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },

  // Partner toggle — inner top-left, nested so it transforms with the counter
  partnerToggle: {
    position: 'absolute', top: 10, left: 10, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  partnerToggleOn: { borderColor: '#6FC96F', backgroundColor: 'rgba(111,201,111,0.1)' },
  partnerCheck: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  partnerCheckOn: { borderColor: '#6FC96F', backgroundColor: '#6FC96F' },
  partnerCheckMark: { fontSize: 9, color: '#000', fontWeight: '800' },
  partnerToggleText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  partnerToggleTextOn: { color: '#6FC96F' },

  // Commander button — centered, just below the life total
  cmdArea: {
    position: 'absolute',
    top: '70%', left: 0, right: 0,
    alignItems: 'center',
  },
  // Fixed square, never resizes and never shows a commander-damage total
  cmdBtn: {
    width: 64, height: 64,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  cmdBtnIcon: { fontSize: 32, color: 'rgba(255,255,255,0.75)' },

  // ── Menu bar — standalone element between the two counter boxes ──
  menuBar: {
    height: MENU_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#0D0D18', borderRadius: 12,
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
    backgroundColor: '#181825',
    borderRadius: 20,
    borderWidth: 2, borderColor: '#5A5A8A',
    overflow: 'hidden',
  },
  cmdPanelTitle: { fontSize: 20, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  cmdPanelSub: {
    fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center',
    marginTop: 2, marginBottom: 16, letterSpacing: 0.5,
  },
  cmdSection: {
    marginBottom: 16,
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
  cmdCounterBox: {
    height: 80,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cmdHalfZone: { flex: 1 },
  cmdValOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  cmdValText: { fontSize: 44, fontWeight: '200', color: '#FFFFFF' },
  cmdValTextElim: { color: '#E05555' },
});
