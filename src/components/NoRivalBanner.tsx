import { useEffect, useReducer, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { shouldShowNoRivalBanner } from '../utils/rival-utils';
import { useThemeColors } from '../utils/theme-utils';
import { showToast } from './AppToast';

// Accounts whose banner was closed since the app was opened. Kept in memory on purpose, not in
// AsyncStorage: the banner comes back once every time the app is opened, for as long as the
// player has no Rival.
const dismissedThisLaunch = new Set<string>();

/**
 * A warning pinned to the top of the screen while the player has no Rival. It does not go away
 * by itself or on a tap elsewhere - only the small x on its right closes it - and once closed it
 * stays closed until the app is next opened. Meanwhile the app keeps searching for a rival (see
 * AppContext's searchForRivals); when one turns up the banner disappears and a toast names them.
 * Mounted once, in the tab layout, so it sits above every tab.
 * Parameters: none; reads the session, rivals, and rivalsLoaded from global context.
 * Returns: the banner, or nothing when the player has a rival, closed it, or rivals are still loading.
 * Edge cases: a failed rival lookup never shows it (see shouldShowNoRivalBanner); the toast only
 * fires when a rival appears after the player was seen to have none in this launch, not on
 * every app start; another account signing in on the same device gets its own banner.
 */
export function NoRivalBanner() {
  const { session, rivals, rivalsLoaded } = useApp();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const userId = session?.user.id;
  // dismissedThisLaunch lives outside React, so closing the banner forces one redraw.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const dismissed = !!userId && dismissedThisLaunch.has(userId);
  // Whether this account was seen with no rival in this launch; a rival arriving after that
  // earns the toast. Tied to the account, so a different sign-in starts fresh.
  const sawNoRivalRef = useRef<{ userId: string | undefined; saw: boolean }>({ userId, saw: false });

  useEffect(() => {
    if (sawNoRivalRef.current.userId !== userId) sawNoRivalRef.current = { userId, saw: false };
    if (!rivalsLoaded) return;
    if (rivals.length === 0) {
      sawNoRivalRef.current.saw = true;
    } else if (sawNoRivalRef.current.saw) {
      sawNoRivalRef.current.saw = false;
      const first = rivals[0];
      showToast('You have a Rival!', `${first.displayName || first.username} is your Rival now. See them on Home.`);
    }
  }, [rivalsLoaded, rivals, userId]);

  if (!userId || !shouldShowNoRivalBanner(rivalsLoaded, rivals.length, dismissed)) return null;

  const close = () => {
    dismissedThisLaunch.add(userId);
    redraw();
  };

  return (
    <View
      style={[
        styles.banner,
        { top: insets.top + 8, backgroundColor: colors.warnBg, borderColor: colors.warnText },
      ]}
      accessibilityRole="alert"
    >
      <Text style={styles.icon}>⚔️</Text>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: colors.warnText }]}>You don&apos;t have a Rival yet</Text>
        <Text style={[styles.body, { color: colors.textBody }]}>
          Nobody has been matched with you so far. We&apos;re checking every minute and will tell you the moment one turns up.
        </Text>
      </View>
      <Pressable
        onPress={close}
        hitSlop={6}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close the no Rival warning"
      >
        <Text style={[styles.closeText, { color: colors.textMuted }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  close: {
    paddingHorizontal: 4,
  },
  closeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
