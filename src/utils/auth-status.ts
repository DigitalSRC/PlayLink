import { useApp } from '../context/AppContext';

export type AuthStatus = 'loading' | 'unauthenticated' | 'no-profile' | 'ready';

/**
 * Combines the Supabase session state and the signed-in user's profile-fetch state into a
 * single status the routing gates (index.tsx and (tabs)/_layout.tsx) branch on, so that
 * four-way branch lives in one place instead of being duplicated across both screens.
 * Parameters: none — reads session/authLoading/currentUser/profileLoading from useApp().
 * Returns: 'loading' while the initial session restore is in flight; 'unauthenticated' once
 * that resolves with no session; 'no-profile' once there's a session but no profiles row yet
 * (the user authenticated but hasn't finished profile-creation); 'ready' once both a session
 * and a profile row exist.
 * Edge cases: profile-fetch loading is only consulted once a session exists — profileLoading
 * stays true indefinitely while unauthenticated (the query is disabled, see useProfileQuery),
 * so checking session first avoids getting stuck on 'loading' forever for a signed-out user.
 */
export const useAuthStatus = (): AuthStatus => {
  const { session, authLoading, currentUser, profileLoading } = useApp();

  if (authLoading) return 'loading';
  if (!session) return 'unauthenticated';
  if (profileLoading) return 'loading';
  if (!currentUser) return 'no-profile';
  return 'ready';
};
