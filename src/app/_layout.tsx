import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider } from '../context/AppContext';
import { persister, queryClient } from '../lib/query-client';

/**
 * Root navigation shell that wraps all screens in global app state and the React Query cache.
 * PersistQueryClientProvider sits above AppProvider because AppProvider's internals call React
 * Query hooks (profile fetch/create/update) that need the query client context above them.
 * GestureHandlerRootView must wrap the whole tree (not just the screen that needs it) for any
 * react-native-gesture-handler gesture — e.g. group-detail.tsx's drag-and-drop placement
 * reordering — to receive touches correctly, especially on Android.
 * Parameters: none.
 * Returns: a Stack navigator with headers hidden globally; each screen manages its own header.
 * Edge cases: none — the provider always initialises with default null user state, and the
 * persisted query cache degrades to an empty cache if AsyncStorage has nothing saved yet.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <AppProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AppProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
