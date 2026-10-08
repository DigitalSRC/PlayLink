import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStatus } from '../utils/auth-status';

/**
 * Entry point that routes new and returning users to the correct screen based on Supabase
 * auth/profile status: signed out goes to sign-in, signed in without a profiles row goes to
 * profile-creation, signed in with a profile goes straight to the tabs.
 * Parameters: none.
 * Returns: a loading spinner while auth/profile status is still resolving, otherwise a
 * Redirect element to the appropriate screen — never renders any other visible UI itself.
 * Edge cases: the spinner covers both the initial session restore from AsyncStorage and the
 * profile fetch that follows it, so there's no flash of the wrong screen on cold start.
 */
export default function Index() {
  const status = useAuthStatus();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#007AFF" />
      </View>
    );
  }
  if (status === 'unauthenticated') {
    return <Redirect href="/sign-in" />;
  }
  if (status === 'no-profile') {
    return <Redirect href="/profile-creation" />;
  }
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
