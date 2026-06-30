import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Full-screen single life counter with portrait/landscape toggle.
 * All content — life total, +/− zones, and Rotate button — lives inside one
 * inner View so that everything rotates together as a unit when Rotate is tapped.
 * The Rotate button is dynamically repositioned within the inner so that it
 * always appears at the visual top-right regardless of rotation state:
 *   portrait  → inner position top/right  (naturally top-right)
 *   landscape → inner position top/left   (after 90° CW, inner-left becomes
 *               the visual top and inner-top becomes the visual right)
 * The back button lives outside the inner and stays pinned at the canvas top-left.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life total is unbounded; holding a zone fires +10/−10 continuously
 * at 150 ms intervals; the interval is always cleared on PressOut.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [life, setLife] = useState(40);
  const [isLandscape, setIsLandscape] = useState(false);
  const [canvas, setCanvas] = useState({ w: 0, h: 0 });
  const holdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ w: width, h: height });
  };

  const tap = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLife(prev => prev + delta);
  };

  const startHold = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLife(prev => prev + delta);
    holdInterval.current = setInterval(
      () => setLife(prev => prev + delta),
      150,
    );
  };

  const stopHold = () => {
    if (holdInterval.current !== null) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
  };

  const { w, h } = canvas;

  // Portrait: inner fills canvas via flex.
  // Landscape: inner natural size is h×w. After 90° CW rotation its visual
  // footprint becomes w×h, exactly filling the canvas.
  // Offset centres the inner on the canvas centre point.
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

          {/* ── Rotating inner: all content rotates as one unit ── */}
          <View style={[styles.inner, innerStyle]}>

            {/* Plus zone — top in portrait, right after CW rotation */}
            <Pressable
              style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
              onPress={() => tap(1)}
              onLongPress={() => startHold(10)}
              onPressOut={stopHold}
              delayLongPress={400}
            >
              <Text style={styles.zoneSymbol}>+</Text>
            </Pressable>

            {/* Minus zone — bottom in portrait, left after CW rotation */}
            <Pressable
              style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
              onPress={() => tap(-1)}
              onLongPress={() => startHold(-10)}
              onPressOut={stopHold}
              delayLongPress={400}
            >
              <Text style={styles.zoneSymbol}>−</Text>
            </Pressable>

            {/* Life total centred over both zones; pointer-events disabled so taps fall through */}
            <View style={styles.lifeOverlay} pointerEvents="none">
              <Text style={styles.lifeText}>{life}</Text>
            </View>

            {/* Rotate button — inside inner so it rotates with content.
                top/right stays fixed in inner coords; the CW rotation carries
                it to the physical bottom-right, which is top-right from the
                reading perspective of the rotated counter. */}
            <Pressable
              style={styles.rotateBtn}
              onPress={() => { Haptics.selectionAsync(); setIsLandscape(p => !p); }}
            >
              <Text style={styles.rotateBtnText}>Rotate</Text>
            </Pressable>

          </View>
          {/* ── end rotating inner ── */}

          {/* Back — outside inner, always fixed at canvas top-left */}
          <Pressable
            style={styles.backBtn}
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
          >
            <Text style={styles.backBtnText}>‹</Text>
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
  rotateBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rotateBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
});
