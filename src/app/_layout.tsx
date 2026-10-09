import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DialogHost } from '../components/AppDialog';
import { ToastHost } from '../components/AppToast';
import { AppProvider, useApp } from '../context/AppContext';
import { persister, queryClient, registerAppFocusRefresh } from '../lib/query-client';
import { useThemeColors } from '../utils/theme-utils';

/**
 * The screen stack, painted in the current theme. It lives in its own component because it has
 * to sit inside AppProvider to read the theme.
 * The stack's own background follows the theme so no dark strip shows behind a light screen
 * (or the reverse) during a transition, and the status bar's clock and icons are switched to
 * whichever shade reads against it.
 * Parameters: none; reads theme from global context.
 * Returns: the status bar setting and a Stack navigator with headers hidden.
 * Edge cases: none - every screen follows the theme, including sign-in, profile creation, and
 * the opening spinner, which before a choice has been saved means the device's own setting.
 */
function ThemedStack() {
  const { theme } = useApp();
  const colors = useThemeColors();
  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
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
