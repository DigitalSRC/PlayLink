import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Full-screen single life counter with portrait/landscape toggle.
 * All interactive elements (life total, +/− zones) live inside one rotating
 * inner container. The back and rotate controls sit outside the inner as
 * fixed overlays so they remain accessible regardless of rotation state.
 * SafeAreaView with edges={['top']} ensures the status bar / notch area is
 * never covered by the canvas.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life total is unbounded; tapping rotate while canvas dimensions
 * are still 0 is safe — landscape mode defers until onLayout fires.
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
  // Landscape: inner is h×w in natural space; after 90° CW rotation its visual
  // footprint becomes w×h, filling the canvas exactly.
  // The offset keeps the inner's centre on the canvas centre.
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screen}>
        <View style={styles.canvas} onLayout={onCanvasLayout}>

          {/* ── Rotating inner: life total + zone taps rotate together ── */}
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

            {/* Life total centred over both zones; pointerEvents="none" lets taps through */}
            <View style={styles.lifeOverlay} pointerEvents="none">
              <Text style={styles.lifeText}>{life}</Text>
            </View>

          </View>
          {/* ── end rotating inner ── */}

          {/* Back — fixed top-left, never rotates */}
          <Pressable
            style={[styles.fixedBtn, styles.fixedBtnLeft]}
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
          >
            <Text style={styles.fixedBtnText}>‹</Text>
          </Pressable>

          {/* Rotate — fixed top-right, never rotates */}
          <Pressable
            style={[styles.fixedBtn, styles.fixedBtnRight]}
            onPress={() => { Haptics.selectionAsync(); setIsLandscape(p => !p); }}
          >
            <Text style={styles.fixedBtnText}>Rotate</Text>
          </Pressable>

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
  fixedBtn: {
    position: 'absolute',
    top: 12,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fixedBtnLeft: {
    left: 12,
  },
  fixedBtnRight: {
    right: 12,
  },
  fixedBtnText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
});
