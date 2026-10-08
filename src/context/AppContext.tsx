import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { UserProfile } from '../data/types';
import { Group } from '../data/groups';
import { registerSupabaseAutoRefresh, supabase } from '../lib/supabase';
import { fetchProfilesByIds } from '../lib/profile-api';
import { useAuthSession } from '../hooks/useAuthSession';
import {
  profileKeys,
  useProfileQuery,
  useUpdateProfileMutation,
} from '../hooks/useProfileQueries';
import { useGroupsQuery } from '../hooks/useGroupQueries';

export type AppTheme = 'dark' | 'light';

interface AppState {
  session: Session | null;
  authLoading: boolean;
  profileLoading: boolean;
  currentUser: UserProfile | null;
  groups: Group[];
  groupsLoading: boolean;
  rivals: UserProfile[];
  chosenRivalId: string | null;
  mostPlayedAgainst: UserProfile | null;
  theme: AppTheme;
  devDateOffset: number;
  clearCurrentUser: () => void;
  setRivals: (rivals: UserProfile[]) => void;
  setChosenRivalId: (id: string) => void;
  setMostPlayedAgainst: (profile: UserProfile | null) => void;
  awardPoints: (amount: number) => void;
  addWin: () => void;
  addLoss: () => void;
  addDraw: () => void;
  resetMonthlyPoints: () => void;
  setTheme: (t: AppTheme) => void;
  setDevDateOffset: (ms: number) => void;
  getNow: () => number;
}

const AppContext = createContext<AppState | null>(null);

// Where the light/dark choice is remembered on this device. It is a setting of the phone, not
// of the account, so it survives signing out and is the same for whoever signs in next.
const THEME_STORAGE_KEY = 'app-theme';

// Where the player's picked Rival is remembered on this device, one entry per account.
const chosenRivalStorageKey = (userId: string) => `chosen-rival:${userId}`;

/**
 * Provides global app state to all child screens.
 * Holds the Supabase auth session, the signed-in user's profile (fetched and cached via React
 * Query, see useProfileQueries.ts), the group list, computed rivals, app theme (remembered on
 * the device), and a dev-date offset for testing. currentUser and its mutators (awardPoints/addWin/addLoss/
 * addDraw/resetMonthlyPoints) are backed by Supabase rather than plain local state — reads
 * come from the cached profile query, writes go through profile mutations with optimistic
 * cache updates so they still feel instant.
 * Parameters: children (React tree to wrap).
 * Returns: a context provider element.
 * Edge cases: throws if useApp is called outside this provider.
 */
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { session, authLoading } = useAuthSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const { data: currentUser, isLoading: profileLoading } = useProfileQuery(userId);
  const updateProfileMutation = useUpdateProfileMutation();
  const { data: groups, isLoading: groupsLoading } = useGroupsQuery();

  const [rivals, setRivals] = useState<UserProfile[]>([]);
  const [chosenRivalId, setChosenRivalIdState] = useState<string | null>(null);
  const [mostPlayedAgainst, setMostPlayedAgainst] = useState<UserProfile | null>(null);
  const [theme, setThemeState] = useState<AppTheme>('dark');
  const [devDateOffset, setDevDateOffset] = useState(0);

  useEffect(() => {
    registerSupabaseAutoRefresh();
  }, []);

  // Restores the saved light/dark choice. Until it has been read the app shows dark, its default.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && (saved === 'light' || saved === 'dark')) setThemeState(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Switches the app between light and dark, and remembers the choice on this device so it is
   * still in effect the next time the app opens. Before this was saved, the app went back to
   * dark on every launch.
   * Parameters: t ('light' or 'dark').
   * Returns: void.
   * Edge cases: a failed save is ignored - the choice still holds for this session; the setting
   * is per device, not synced to the account.
   */
  const setTheme = (t: AppTheme) => {
    setThemeState(t);
    AsyncStorage.setItem(THEME_STORAGE_KEY, t).catch(() => {});
  };

  // Rehydrates the rivals list from the profile's stored rival_ids whenever it loads or
  // changes — without this, a returning user (or one whose rivals were just updated by the
  // daily refresh job) would see an empty rivals list until profile-creation ran again, since
  // `rivals` is otherwise only ever populated once, at signup time.
  const rivalIdsKey = currentUser?.rivalIds?.join(',') ?? '';
  useEffect(() => {
    if (!rivalIdsKey) return;
    let cancelled = false;
    Promise.all([
      fetchProfilesByIds(rivalIdsKey.split(',')),
      userId ? AsyncStorage.getItem(chosenRivalStorageKey(userId)).catch(() => null) : null,
    ]).then(([profiles, savedId]) => {
      if (cancelled) return;
      setRivals(profiles);
      // Keep the rival the player picked, as long as they're still one of their rivals; the daily
      // refresh can drop them, and then the first of the new list stands in.
      const saved = profiles.some((p) => p.id === savedId) ? savedId : null;
      setChosenRivalIdState((prev) =>
        prev !== null && profiles.some((p) => p.id === prev) ? prev : saved ?? profiles[0]?.id ?? null
      );
    });
    return () => {
      cancelled = true;
    };
  }, [rivalIdsKey, userId]);

  /**
   * Records which of their rivals the player has picked as their main Rival, and remembers it
   * on this device so it is still their Rival the next time the app opens. Before this was
   * saved, the pick only lived in memory and quietly reset to the first rival on every restart.
   * Parameters: id (the chosen rival's profile id).
   * Returns: void.
   * Edge cases: with no signed-in user the pick is kept in memory only; a failed save is
   * ignored, since the pick still holds for this session; the pick is per device, not synced.
   */
  const setChosenRivalId = (id: string) => {
    setChosenRivalIdState(id);
    if (userId) AsyncStorage.setItem(chosenRivalStorageKey(userId), id).catch(() => {});
  };

  const clearCurrentUser = () => {
    if (userId) {
      queryClient.removeQueries({ queryKey: profileKeys.detail(userId) });
    }
    // Fire-and-forget to keep this function's existing void signature; screens navigate away
    // immediately after calling this rather than awaiting sign-out completion.
    supabase.auth.signOut();
    setRivals([]);
    setChosenRivalIdState(null);
    setMostPlayedAgainst(null);
  };

  const applyProfilePatch = (patch: Partial<Omit<UserProfile, 'id'>>) => {
    if (!userId) return;
    updateProfileMutation.mutate({ userId, patch });
  };

  const awardPoints = (amount: number) => {
    if (!currentUser) return;
    applyProfilePatch({
      points: Math.max(0, currentUser.points + amount),
      monthlyPoints: amount > 0 ? currentUser.monthlyPoints + amount : currentUser.monthlyPoints,
    });
  };

  const addWin = () => {
    if (!currentUser) return;
    applyProfilePatch({
      wins: currentUser.wins + 1,
      points: currentUser.points + 30,
      monthlyPoints: currentUser.monthlyPoints + 30,
    });
  };

  const addLoss = () => {
    if (!currentUser) return;
    applyProfilePatch({ losses: currentUser.losses + 1 });
  };

  const addDraw = () => {
    if (!currentUser) return;
    applyProfilePatch({
      draws: currentUser.draws + 1,
      points: currentUser.points + 10,
      monthlyPoints: currentUser.monthlyPoints + 10,
    });
  };

  const resetMonthlyPoints = () => {
    if (!currentUser) return;
    applyProfilePatch({ monthlyPoints: 0 });
  };

  const getNow = () => Date.now() + devDateOffset;

  return (
    <AppContext.Provider
      value={{
        session, authLoading, profileLoading,
        currentUser: currentUser ?? null, groups: groups ?? [], groupsLoading,
        rivals, chosenRivalId, mostPlayedAgainst,
        theme, devDateOffset,
        clearCurrentUser, setRivals,
        setChosenRivalId, setMostPlayedAgainst,
        awardPoints, addWin, addLoss, addDraw, resetMonthlyPoints,
        setTheme, setDevDateOffset, getNow,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

/**
 * Returns the app-wide state from the nearest AppProvider.
 * Parameters: none.
 * Returns: the AppState object with session/auth status, user, groups, rivals, theme, and all mutators.
 * Edge cases: throws an error when called outside an AppProvider.
 */
export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
