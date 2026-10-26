import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DialogHost } from '../components/AppDialog';
import { ToastHost } from '../components/AppToast';
import { AppProvider, useApp } from '../context/AppContext';
import { persister, queryClient, registerAppFocusRefresh } from '../lib/query-client';
import { useAuthStatus } from '../utils/auth-status';
import { useThemeColors } from '../utils/theme-utils';

/**
 * The screen stack, painted in the current theme. It lives in its own component because it has
 * to sit inside AppProvider to read the theme.
 * The stack's own background follows the theme so no dark strip shows behind a light screen
 * (or the reverse) during a transition, and the status bar's clock and icons are switched to
 * whichever shade reads against it.
 * It also keeps signed-out visitors off the screens that only make sense signed in. The tabs
 * have their own gate, but group-detail, player-profile, and profile-creation are pushed on
 * this stack beside them, so a link straight to one of them used to open an empty shell.
 * Listing them under Stack.Protected makes the router refuse them and fall back to the start
 * screen, which sends the visitor on to sign-in.
 * Parameters: none; reads theme and sign-in status from global context.
 * Returns: the status bar setting and a Stack navigator with headers hidden.
 * Edge cases: every screen follows the theme, including sign-in, profile creation, and the
 * opening spinner, which before a choice has been saved means the device's own setting. While
 * the sign-in status is still loading the screens stay reachable, so a link opened on a cold
 * start is not thrown away before the saved session has been read; once the status settles on
 * signed out (or, for the two player screens, on "no profile yet") an open screen is closed.
 * profile-creation stays open after the profile is saved, because its last step (the rival
 * reveal) is shown then. A screen not listed here is not protected.
 */
function ThemedStack() {
  const { theme } = useApp();
  const colors = useThemeColors();
  const status = useAuthStatus();
  const signedIn = status !== 'unauthenticated';
  const hasProfile = signedIn && status !== 'no-profile';
  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="profile-creation" />
        </Stack.Protected>
        <Stack.Protected guard={hasProfile}>
          <Stack.Screen name="group-detail" />
          <Stack.Screen name="player-profile" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/**
 * Root navigation shell that wraps all screens in global app state and the React Query cache.
 * PersistQueryClientProvider sits above AppProvider because AppProvider's internals call React
 * Query hooks (profile fetch/create/update) that need the query client context above them.
 * GestureHandlerRootView must wrap the whole tree (not just the screen that needs it) for any
 * react-native-gesture-handler gesture — e.g. group-detail.tsx's drag-and-drop placement
 * reordering — to receive touches correctly, especially on Android.
 * DialogHost sits beside the Stack, inside AppProvider (it reads the theme), and draws every
 * pop-up requested through showDialog above whichever screen is open. ToastHost does the same
 * for the short "it worked" messages raised through showToast.
 * On a phone it also tells React Query when the app returns to the foreground
 * (registerAppFocusRefresh), so out-of-date groups and profile data are fetched again then.
 * Parameters: none.
 * Returns: the themed Stack navigator (headers hidden; each screen manages its own header) and the dialog host.
 * Edge cases: none — the provider always initialises with default null user state, and the
 * persisted query cache degrades to an empty cache if AsyncStorage has nothing saved yet.
 */
export default function RootLayout() {
  useEffect(() => {
    registerAppFocusRefresh();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <AppProvider>
          <ThemedStack />
          <ToastHost />
          <DialogHost />
        </AppProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
