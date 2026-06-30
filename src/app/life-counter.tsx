import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Full-screen single life counter with portrait/landscape toggle.
 * All interactive elements live inside one rotating inner container so that
 * pressing ↻ rotates the life total, +/− symbols, and the rotate button together.
 * Portrait default: + zone on top half, − zone on bottom half.
 * Landscape (↻): inner rotated 90° CW so + is on the right, − on the left.
 * Canvas dimensions are measured via onLayout so the inner can be repositioned
 * to stay centered and fill the canvas after rotation.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life total is unbounded (can go negative); back button is outside
 * the rotating container and always stays in place.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [life, setLife] = useState(40);
  const [isLandscape, setIsLandscape] = useState(false);
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  };

  const bump = (delta: number) => {
    Haptics.impactAsync(
      Math.abs(delta) >= 10
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    setLife(prev => prev + delta);
  };

  const { w, h } = canvas;

  // Portrait: inner fills canvas via flex.
  // Landscape: inner is h×w in natural space so after a 90° CW rotation it
  // becomes w×h visually — exactly filling the canvas.
  // Offset so the inner's center stays on the canvas center after repositioning.
  const innerStyle =
    isLandscape && w > 0
      ? ({
          position: 'absolute' as const,
          width: h,
          height: w,
          top: (h - w) / 2,
          left: (w - h) / 2,
          transform: [{ rotate: '90deg' }],
        } as const)
      : ({ flex: 1 } as const);

  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>

        {/* Back button — outside the rotating inner, always stays top-left */}
        <Pressable
          style={styles.backBtn}
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>

        {/* ── Rotating inner — everything inside rotates as one unit ── */}
        <View style={[styles.inner, innerStyle]}>

          {/* Plus zone — top in portrait, right after CW rotation */}
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => bump(1)}
            onLongPress={() => bump(10)}
          >
            <Text style={styles.zoneSymbol}>+</Text>
          </Pressable>

          {/* Minus zone — bottom in portrait, left after CW rotation */}
          <Pressable
            style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
            onPress={() => bump(-1)}
            onLongPress={() => bump(-10)}
          >
            <Text style={styles.zoneSymbol}>−</Text>
          </Pressable>

          {/* Life total floats over zones; pointerEvents="none" lets taps fall through */}
          <View style={styles.lifeOverlay} pointerEvents="none">
            <Text style={styles.lifeText}>{life}</Text>
          </View>

          {/* Rotate button nested here so it rotates with the rest */}
          <Pressable
            style={styles.rotateBtn}
            onPress={() => { Haptics.selectionAsync(); setIsLandscape(p => !p); }}
          >
            <Text style={styles.rotateBtnText}>↻</Text>
          </Pressable>

        </View>
        {/* ── end rotating inner ── */}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 20,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#111118',
    borderWidth: 2,
    borderColor: '#3C3C5C',
    borderRadius: 16,
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 30,
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
    fontSize: 120,
    fontWeight: '200',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  rotateBtn: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotateBtnText: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.55)',
  },
});
