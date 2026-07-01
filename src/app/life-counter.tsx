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

// Commander popup background: white with a light-gray center, approximated as a grid
// of flat cells whose alpha increases toward the center (a "radial" vignette without
// a gradient library). Percentage-based cell sizing, so it scales with the panel.
const CMD_BG_GRID = 10;
const CMD_BG_MAX_ALPHA = 0.16;
const CMD_BG_GRAY: [number, number, number] = [120, 120, 130];
const CMD_BG_ROWS: string[][] = Array.from({ length: CMD_BG_GRID }, (_, row) =>
  Array.from({ length: CMD_BG_GRID }, (_, col) => {
    const nx = (col + 0.5) / CMD_BG_GRID - 0.5;
    const ny = (row + 0.5) / CMD_BG_GRID - 0.5;
    const dist = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2 * 2; // ~0 center, ~1 corner
    const alpha = CMD_BG_MAX_ALPHA * Math.max(0, 1 - dist);
    return `rgba(${CMD_BG_GRAY[0]},${CMD_BG_GRAY[1]},${CMD_BG_GRAY[2]},${alpha.toFixed(3)})`;
  }),
);

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
 * (sized off the smaller of screen width/height, minus 10px) centered on screen,
 * headed by two static lines ("Commander"/"Damage") followed by a fixed 3x2 grid of
 * up to 6 squares — one per player including the victim's own "Self" square, pinned
 * to the bottom-center slot so it always lands nearest the opening player once the
 * panel is rotated to their own counter's orientation — with empty slots reserved
 * when fewer than 6 players exist.
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

    // Square panel sized off whichever screen dimension is smaller (minus a 5px
    // margin each side) so it never overflows on a wide/short (landscape) screen.
    const PANEL_SIZE = Math.min(content.w, content.h) - 10;
    const PANEL_W = PANEL_SIZE;
    const PANEL_H = PANEL_SIZE;

    // Inner content rotates to face the opening player — the same getPlayerAngle
    // used for that player's own life-total box, so the whole grid (including the
    // Self square) always reads in the same orientation as their own counter.
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

    // One square per attacker (self included). isSelf=true: own-commander damage —
    // never eliminates, never deducts life. Squares are small, so the partner slot
    // toggle is a compact "C1"/"C2" pill instead of the full two-button row.
    const renderSquare = (attackerIdx: number, isSelf: boolean) => {
      const slot = (activeCmd[attackerIdx] ?? 0) as 0 | 1;
      const dmg = getCmdVal(victim, attackerIdx, slot);
      const elim = !isSelf && dmg >= 21;
      const label = isSelf ? 'Self' : players[attackerIdx].name;
      const showPartnerToggle = players[attackerIdx].hasPartner;

      return (
        <View style={[styles.cmdSquare, elim && styles.cmdSquareElim]}>
          <View style={styles.cmdSquareZones}>
            <Pressable
              style={styles.cmdSquareHalf}
              onPress={() => adjustCmdDmg(victim, attackerIdx, slot, -1, isSelf)}
              onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, -10, isSelf)}
              delayLongPress={400}
            />
            <Pressable
              style={styles.cmdSquareHalf}
              onPress={() => adjustCmdDmg(victim, attackerIdx, slot, 1, isSelf)}
              onLongPress={() => adjustCmdDmg(victim, attackerIdx, slot, 10, isSelf)}
              delayLongPress={400}
            />
          </View>

          <Text style={styles.cmdSquareLabel} numberOfLines={1} pointerEvents="none">{label}</Text>

          {showPartnerToggle && (
            <Pressable
              style={styles.cmdSquareSlotToggle}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveCmd(prev => ({ ...prev, [attackerIdx]: slot === 0 ? 1 : 0 }));
              }}
            >
              <Text style={styles.cmdSquareSlotToggleText}>{slot === 0 ? 'C1' : 'C2'}</Text>
            </Pressable>
          )}

          <View pointerEvents="none" style={styles.cmdSquareValOverlay}>
            <Text style={[styles.cmdSquareValText, elim && styles.cmdSquareValTextElim]}>{dmg}</Text>
          </View>
        </View>
      );
    };

    // 3x2 grid, slots numbered left-to-right/top-to-bottom (0,1,2 top row; 3,4,5
    // bottom row) in the *unrotated* local frame. Self is pinned to the bottom-center
    // slot: since the whole panel rotates to match the opening player's own counter
    // orientation, local-bottom always ends up on the edge nearest that player — e.g.
    // for Player 2 (bottom of the main screen, unrotated) local-bottom stays visually
    // at the bottom; for Player 1 (top of the main screen, rotated 180°) local-bottom
    // flips to visually the top, which is the edge nearest Player 1's own seat. Other
    // players fill the top row first (so today's single opponent lands "on top",
    // mirroring their position on the main two-player screen), then the remaining
    // bottom-row slots. GRID_SLOTS stays fixed at 6 so the layout never reflows as
    // players are added/removed.
    const GRID_SLOTS = 6;
    const SELF_SLOT = 4;
    const OPPONENT_SLOT_ORDER = [1, 0, 2, 3, 5];
    const otherPlayers = players.map((_, i) => i).filter(i => i !== victim);
    const attackerOrder: (number | undefined)[] = new Array(GRID_SLOTS).fill(undefined);
    attackerOrder[SELF_SLOT] = victim;
    otherPlayers.forEach((attackerIdx, i) => {
      if (i < OPPONENT_SLOT_ORDER.length) attackerOrder[OPPONENT_SLOT_ORDER[i]] = attackerIdx;
    });

    return (
      <Pressable
        style={styles.cmdOverlay}
        onPress={() => { Haptics.selectionAsync(); setCmdPanelFor(null); }}
      >
        <Pressable style={[styles.cmdPanel, { width: PANEL_W, height: PANEL_H }]}>
          {/* White base with a light-gray center vignette; static, not rotated */}
          <View style={styles.cmdPanelBg} pointerEvents="none">
            {CMD_BG_ROWS.map((row, r) => (
              <View key={r} style={styles.cmdPanelBgRow}>
                {row.map((color, c) => (
                  <View key={c} style={[styles.cmdPanelBgCell, { backgroundColor: color }]} />
                ))}
              </View>
            ))}
          </View>
          <View style={innerStyle}>
            <Text style={styles.cmdHeaderLine}>Commander</Text>
            <Text style={styles.cmdHeaderLine}>Damage</Text>
            <View style={styles.cmdGrid}>
              {Array.from({ length: GRID_SLOTS }, (_, i) => {
                const attackerIdx = attackerOrder[i];
                if (attackerIdx === undefined) {
                  return <View key={`empty-${i}`} style={styles.cmdGridCell} />;
                }
                return (
                  <View key={attackerIdx} style={styles.cmdGridCell}>
                    {renderSquare(attackerIdx, attackerIdx === victim)}
                  </View>
                );
              })}
            </View>
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
  // White fill (was dark) with the faint red/white/green gradientOverlay layered on
  // top; every text/icon color below is the dark-on-white inverse of what it used to be.
  counterBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  zoneActive: { backgroundColor: 'rgba(0,0,0,0.06)' },
  zoneSymbol: { fontSize: 60, color: 'rgba(0,0,0,0.28)', fontWeight: '100' },

  lifeOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  lifeText: { fontSize: 80, fontWeight: '200', color: '#111118', includeFontPadding: false },
  lifeTextDead: { color: 'rgba(0,0,0,0.3)' },
  eliminatedLabel: { fontSize: 11, fontWeight: '600', color: '#E05555', letterSpacing: 1.5, marginTop: 4 },

  playerNameBadge: {
    position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center',
  },
  playerNameText: { fontSize: 13, color: 'rgba(0,0,0,0.45)', fontWeight: '500' },

  // Rotate — inner top-right
  rotateBtn: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.08)',
  },
  rotateBtnText: { fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: '500' },

  // Partner toggle — inner top-left, nested so it transforms with the counter
  partnerToggle: {
    position: 'absolute', top: 10, left: 10, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.14)',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  partnerToggleOn: { borderColor: '#6FC96F', backgroundColor: 'rgba(111,201,111,0.1)' },
  partnerCheck: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center',
  },
  partnerCheckOn: { borderColor: '#6FC96F', backgroundColor: '#6FC96F' },
  partnerCheckMark: { fontSize: 9, color: '#000', fontWeight: '800' },
  partnerToggleText: { fontSize: 12, color: 'rgba(0,0,0,0.45)', fontWeight: '600' },
  partnerToggleTextOn: { color: '#6FC96F' },

  // Commander button — centered, anchored a fixed distance above the box's bottom
  // edge (rather than a top % offset) so doubling its size can't clip against the
  // box's overflow:hidden edge on a short box.
  cmdArea: {
    position: 'absolute',
    bottom: 16, left: 0, right: 0,
    alignItems: 'center',
  },
  // Fixed square, never resizes and never shows a commander-damage total
  cmdBtn: {
    width: 110, height: 110,
    justifyContent: 'center', alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.2)',
    backgroundColor: 'rgba(0,0,0,0.07)',
  },
  cmdBtnIcon: { fontSize: 64, color: 'rgba(0,0,0,0.75)' },

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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2, borderColor: '#5A5A8A',
    overflow: 'hidden',
  },
  // Static (unrotated) light-gray-center vignette sitting behind the rotated content —
  // a radial fade looks the same regardless of rotation, so it doesn't need to rotate.
  cmdPanelBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cmdPanelBgRow: { flex: 1, flexDirection: 'row' },
  cmdPanelBgCell: { flex: 1 },
  // Two static header lines, then a fixed 3x2 grid of up to 6 squares (one per
  // player, self included) filling the remaining space evenly.
  cmdHeaderLine: { fontSize: 22, fontWeight: '700', color: '#111118', textAlign: 'center', lineHeight: 26 },
  cmdGrid: {
    flex: 1,
    marginTop: 16,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  cmdGridCell: { width: '31%', height: '31%', aspectRatio: 1 },
  cmdSquare: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.14)',
    backgroundColor: 'rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  cmdSquareElim: { borderColor: '#E05555', backgroundColor: 'rgba(224,85,85,0.12)' },
  cmdSquareZones: { flex: 1, flexDirection: 'row' },
  cmdSquareHalf: { flex: 1 },
  cmdSquareLabel: {
    position: 'absolute', top: 6, left: 2, right: 2,
    textAlign: 'center', fontSize: 10, color: 'rgba(0,0,0,0.5)', fontWeight: '600',
  },
  cmdSquareSlotToggle: {
    position: 'absolute', top: 4, right: 4, zIndex: 5,
    paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 8, backgroundColor: 'rgba(108,99,255,0.2)',
  },
  cmdSquareSlotToggleText: { fontSize: 9, color: '#5A4FD9', fontWeight: '700' },
  cmdSquareValOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  cmdSquareValText: { fontSize: 28, fontWeight: '200', color: '#111118' },
  cmdSquareValTextElim: { color: '#E05555' },
});
