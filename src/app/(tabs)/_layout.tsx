import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../../context/AppContext';
import { useThemeColors } from '../../utils/theme-utils';

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
 * Redirects to profile creation if no user profile exists in context.
 * Parameters: none.
 * Returns: a Tabs navigator element or a Redirect element.
 * Edge cases: the redirect prevents any tab from rendering when the user is unauthenticated.
 */
export default function TabLayout() {
  const { currentUser } = useApp();
  const colors = useThemeColors();

  if (!currentUser) {
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
