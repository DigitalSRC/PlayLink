import { Redirect } from 'expo-router';
import { useApp } from '../context/AppContext';

/**
 * Entry point that routes new and returning users to the correct screen.
 * Checks whether a profile exists in context and redirects accordingly.
 * Parameters: none.
 * Returns: a Redirect element — never renders visible UI itself.
 * Edge cases: always redirects; the targeted screens handle their own loading states.
 */
export default function Index() {
  const { currentUser } = useApp();

  if (currentUser) {
    return <Redirect href="/(tabs)/home" />;
  }
  return <Redirect href="/profile-creation" />;
}
