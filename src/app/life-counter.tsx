import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MENU_H = 48;
const START_LIFE = 40;

type IntervalRef = React.MutableRefObject<ReturnType<typeof setInterval> | null>;

/**
 * Two-player life counter.
 * The canvas is divided into two equal halves separated by a menu bar.
 * The top half is rotated 180° so the opposing player reads it right-side-up.
 * Each half contains a + zone (top), − zone (bottom), centred life total, and a
 * Rotate button fixed at the player's top-right that rotates all content together.
 * In landscape the inner is resized to halfH × canvasW so after 90°/270° it fills
 * its half exactly. The Rotate button stays at top/right inside the inner in all
 * states; the transform carries it to the correct visual corner automatically.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life totals are unbounded; Reset restores both to START_LIFE and
 * clears any landscape rotation; hold interval is always cleared on PressOut.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const [topLife, setTopLife] = useState(START_LIFE);
  const [bottomLife, setBottomLife] = useState(START_LIFE);
  const [topLandscape, setTopLandscape] = useState(false);
  const [bottomLandscape, setBottomLandscape] = useState(false);
  const topInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  };

  const halfH = canvas.h > 0 ? (canvas.h - MENU_H) / 2 : 0;

  const reset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTopLife(START_LIFE);
    setBottomLife(START_LIFE);
    setTopLandscape(false);
    setBottomLandscape(false);
  };

  /**
   * Renders one player's half of the canvas.
   * isTop=true applies a 180° base rotation so the opposing player reads normally.
   * Landscape rotation is 270° for the top player, 90° for the bottom player,
   * so both experience + on their right and − on their left when rotated.
   * Parameters: life, setLife, isLandscape, setIsLandscape, interval ref, isTop flag.
   * Returns: a JSX element containing the player's half.
   * Edge cases: falls back to portrait layout until canvas dimensions are measured.
   */
  const renderHalf = (
    life: number,
    setLife: React.Dispatch<React.SetStateAction<number>>,
    isLandscape: boolean,
    setIsLandscape: React.Dispatch<React.SetStateAction<boolean>>,
    interval: IntervalRef,
    isTop: boolean,
  ) => {
    const startHold = (delta: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLife(p => p + delta);
      interval.current = setInterval(() => setLife(p => p + delta), 150);
    };

    const stopHold = () => {
      if (interval.current !== null) {
        clearInterval(interval.current);
        interval.current = null;
      }
    };

    // Top half: base 180°. Landscape adds another 90° from the player's view:
    //   top landscape  = 180° + 90° (their CW) = 270° screen
    //   bottom landscape = 90° screen (their CW)
    const rotateAngle = isLandscape
      ? (isTop ? '270deg' : '90deg')
      : (isTop ? '180deg' : null);

    // In landscape, inner is halfH × canvasW so after rotation it fills canvasW × halfH.
    const innerStyle: object =
      isLandscape && canvas.w > 0 && halfH > 0
        ? {
            position: 'absolute' as const,
            width: halfH,
            height: canvas.w,
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

          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLife(p => p + 1); }}
            onLongPress={() => startHold(10)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>+</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLife(p => p - 1); }}
            onLongPress={() => startHold(-10)}
            onPressOut={stopHold}
            delayLongPress={400}
          >
            <Text style={styles.zoneSymbol}>−</Text>
          </Pressable>

          <View style={styles.lifeOverlay} pointerEvents="none">
            <Text style={styles.lifeText}>{life}</Text>
          </View>

          {/* Rotate button at top/right of inner — transform carries it to the
              player's visual top-right in every orientation */}
          <Pressable
            style={styles.rotateBtn}
            onPress={() => { Haptics.selectionAsync(); setIsLandscape(p => !p); }}
          >
            <Text style={styles.rotateBtnText}>Rotate</Text>
          </Pressable>

        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.canvas} onLayout={onCanvasLayout}>

          {renderHalf(topLife, setTopLife, topLandscape, setTopLandscape, topInterval, true)}

          {/* Menu bar — back button left, Reset centred */}
          <View style={styles.menuBar}>
            <Pressable
              style={styles.menuBtn}
              onPress={() => { Haptics.selectionAsync(); router.back(); }}
            >
              <Text style={styles.menuBtnText}>‹</Text>
            </Pressable>

            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetBtnText}>Reset</Text>
            </Pressable>

            {/* Spacer mirrors back button width so Reset stays centred */}
            <View style={styles.menuBtn} />
          </View>

          {renderHalf(bottomLife, setBottomLife, bottomLandscape, setBottomLandscape, bottomInterval, false)}

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  screen: {
    flex: 1,
    padding: 20,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#111118',
    borderWidth: 2,
    borderColor: '#3C3C5C',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  half: {
    flex: 1,
    overflow: 'hidden',
  },
  inner: {
    flexDirection: 'column',
  },
  zone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  zoneSymbol: {
    fontSize: 60,
    color: 'rgba(255,255,255,0.28)',
    fontWeight: '100',
  },
  lifeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lifeText: {
    fontSize: 80,
    fontWeight: '200',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  rotateBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rotateBtnText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  menuBar: {
    height: MENU_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2A2A3A',
    backgroundColor: '#0D0D18',
  },
  menuBtn: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBtnText: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '400',
  },
  resetBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  resetBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
});
