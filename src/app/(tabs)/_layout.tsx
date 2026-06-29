import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useApp } from '../../context/AppContext';

const TAB_ICON: Record<string, { active: string; inactive: string }> = {
  home: { active: '🏠', inactive: '🏠' },
  browse: { active: '🔍', inactive: '🔍' },
  stats: { active: '📊', inactive: '📊' },
  shop: { active: '🛍️', inactive: '🛍️' },
  profile: { active: '👤', inactive: '👤' },
};

/**
 * Defines the five-tab navigator for logged-in users: Home, Find, Stats, Shop, Profile.
 * Redirects to profile creation if no user profile exists in context.
 * Parameters: none.
 * Returns: a Tabs navigator element or a Redirect element.
 * Edge cases: the redirect prevents any tab from rendering when the user is unauthenticated.
 */
export default function TabLayout() {
  const { currentUser } = useApp();

  if (!currentUser) {
    return <Redirect href="/profile-creation" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0F0F14',
          borderTopColor: '#1C1C24',
          borderTopWidth: 1,
          height: 94,
          paddingBottom: 16,
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 29 }}>
            {TAB_ICON[route.name]?.[focused ? 'active' : 'inactive'] ?? '●'}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="home" options={{ tabBarLabel: 'Home' }} />
      <Tabs.Screen name="browse" options={{ tabBarLabel: 'Find' }} />
      <Tabs.Screen name="stats" options={{ tabBarLabel: 'Stats' }} />
      <Tabs.Screen name="shop" options={{ tabBarLabel: 'Shop' }} />
      <Tabs.Screen name="profile" options={{ tabBarLabel: 'Profile' }} />
    </Tabs>
  );
}
