import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * Full-screen single life counter.
 * Portrait default: + zone fills the top half, − zone fills the bottom half.
 * Landscape (after tapping ↻): − zone fills the left half, + zone fills the right half,
 * mirroring a clockwise 90° physical rotation of the device.
 * Parameters: none.
 * Returns: a React element occupying the full screen.
 * Edge cases: life total can go negative; no lower bound is enforced.
 */
export default function LifeCounterScreen() {
  const router = useRouter();
  const [life, setLife] = useState(40);
  const [isLandscape, setIsLandscape] = useState(false);

  const bump = (delta: number, heavy = false) => {
    heavy
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLife(prev => prev + delta);
  };

  // In portrait: zone1 = top (+), zone2 = bottom (−)
  // In landscape: zone1 = left (−), zone2 = right (+)
  const zone1Delta  = isLandscape ? -1 : 1;
  const zone1Label  = isLandscape ? '−' : '+';
  const zone2Delta  = isLandscape ? 1 : -1;
  const zone2Label  = isLandscape ? '+' : '−';

  return (
    <View style={styles.screen}>
      <View style={[styles.canvas, isLandscape && styles.canvasLandscape]}>

        {/* Zone 1 — top in portrait, left in landscape */}
        <Pressable
          style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
          onPress={() => bump(zone1Delta)}
          onLongPress={() => bump(zone1Delta * 5, true)}
        >
          <Text style={styles.zoneSymbol}>{zone1Label}</Text>
        </Pressable>

        {/* Zone 2 — bottom in portrait, right in landscape */}
        <Pressable
          style={({ pressed }) => [styles.zone, pressed && styles.zoneActive]}
          onPress={() => bump(zone2Delta)}
          onLongPress={() => bump(zone2Delta * 5, true)}
        >
          <Text style={styles.zoneSymbol}>{zone2Label}</Text>
        </Pressable>

        {/* Life total floats over both zones, never intercepts touches */}
        <View style={styles.lifeOverlay} pointerEvents="none">
          <Text style={styles.lifeText}>{life}</Text>
        </View>

        {/* Back — top-left corner */}
        <Pressable
          style={[styles.cornerBtn, styles.cornerTL]}
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
        >
          <Text style={styles.cornerBtnText}>‹</Text>
        </Pressable>

        {/* Rotate CW 90° — top-right corner */}
        <Pressable
          style={[styles.cornerBtn, styles.cornerTR]}
          onPress={() => { Haptics.selectionAsync(); setIsLandscape(p => !p); }}
        >
          <Text style={styles.cornerBtnText}>↻</Text>
        </Pressable>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 16,
  },
  canvas: {
    flex: 1,
    flexDirection: 'column',
    borderWidth: 2,
    borderColor: '#2A2A3A',
    borderRadius: 16,
    overflow: 'hidden',
  },
  canvasLandscape: {
    flexDirection: 'row',
  },
  zone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  zoneSymbol: {
    fontSize: 56,
    color: 'rgba(255,255,255,0.30)',
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
  cornerBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerTL: { top: 12, left: 12 },
  cornerTR: { top: 12, right: 12 },
  cornerBtnText: {
    fontSize: 22,
    color: 'rgba(255,255,255,0.55)',
  },
});
