import { Stack } from "expo-router";

/**
 * Serves as the root navigation container for the application.
 * This component wires Expo Router so the screens inside the app folder can be discovered and navigated correctly.
 * It keeps the navigation setup centralized and minimal.
 * Parameters: none.
 * Returns: a Stack navigator element that renders the current route.
 * Edge cases: if route configuration is missing, the app will still render a blank stack shell.
 */
export default function RootLayout() {
  return <Stack />;
}
