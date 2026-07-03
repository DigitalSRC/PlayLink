import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '../../utils/theme-utils';
import { useAuthStatus } from '../../utils/auth-status';

const TAB_ICON: Record<string, { active: string; inactive: string }> = {
  home: { active: '🏠', inactive: '🏠' },
  browse: { active: '🔍', inactive: '🔍' },
  stats: { active: '📊', inactive: '📊' },
  shop: { active: '🛍️', inactive: '🛍️' },
  profile: { active: '👤', inactive: '👤' },
};

const HOME_ICON_SIZE = 34;
const ICON_SIZE = 27;
const HOME_LABEL_SIZE = 15;
const LABEL_SIZE = 13;

/**
 * Defines the five-tab navigator for logged-in users. Tab order (left to right) is
 * Stats, Shop, Home, Find, Profile: Stats/Shop sit on the least thumb-reachable left
 * side, Home is centered and rendered larger as the primary landing tab, and Find/
 * Profile take the two rightmost slots that are easiest to reach one-handed.
 * Redirects to sign-in if there's no Supabase session, or to profile creation if the session
 * exists but no profiles row does yet.
 * Parameters: none.
 * Returns: a loading spinner while auth/profile status is resolving, a Redirect element if
 * the user isn't fully ready, or the Tabs navigator element once they are.
 * Edge cases: the redirect/spinner prevents any tab from rendering until a profile is
 * confirmed to exist, so no tab ever has to handle a null currentUser itself.
 */
export default function TabLayout() {
  const status = useAuthStatus();
  const colors = useThemeColors();

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

  return (
    <Tabs
      screenOptions={({ route }) => {
        const isHome = route.name === 'home';
        return {
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 94,
            paddingBottom: 16,
          },
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: isHome ? HOME_LABEL_SIZE : LABEL_SIZE,
            fontWeight: isHome ? '800' : '600',
          },
          tabBarIcon: ({ focused }) => (
            <Text style={{ fontSize: isHome ? HOME_ICON_SIZE : ICON_SIZE }}>
              {TAB_ICON[route.name]?.[focused ? 'active' : 'inactive'] ?? '●'}
            </Text>
          ),
        };
      }}
    >
      <Tabs.Screen name="stats" options={{ tabBarLabel: 'Stats' }} />
      <Tabs.Screen name="shop" options={{ tabBarLabel: 'Shop' }} />
      <Tabs.Screen name="home" options={{ tabBarLabel: 'Home' }} />
      <Tabs.Screen name="browse" options={{ tabBarLabel: 'Find' }} />
      <Tabs.Screen name="profile" options={{ tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
