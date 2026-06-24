import { Stack } from 'expo-router';
import { AppProvider } from '../context/AppContext';

/**
 * Root navigation shell that wraps all screens in global app state.
 * Parameters: none.
 * Returns: a Stack navigator with headers hidden globally; each screen manages its own header.
 * Edge cases: none — the provider always initialises with default null user state.
 */
export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AppProvider>
  );
}
