import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserProfile } from '../data/types';
import { Group, HARDCODED_GROUPS } from '../data/groups';

export type AppTheme = 'dark' | 'light';

interface AppState {
  currentUser: UserProfile | null;
  groups: Group[];
  rivals: UserProfile[];
  chosenRivalId: number | null;
  mostPlayedAgainst: UserProfile | null;
  theme: AppTheme;
  devDateOffset: number;
  setCurrentUser: (profile: UserProfile) => void;
  clearCurrentUser: () => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setRivals: (rivals: UserProfile[]) => void;
  setChosenRivalId: (id: number) => void;
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

/**
 * Provides global app state to all child screens.
 * Holds the current user profile, group list, computed rivals, app theme, and a dev-date offset for testing.
 * Parameters: children (React tree to wrap).
 * Returns: a context provider element.
 * Edge cases: throws if useApp is called outside this provider.
 */
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>(HARDCODED_GROUPS);
  const [rivals, setRivals] = useState<UserProfile[]>([]);
  const [chosenRivalId, setChosenRivalId] = useState<number | null>(null);
  const [mostPlayedAgainst, setMostPlayedAgainst] = useState<UserProfile | null>(null);
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [devDateOffset, setDevDateOffset] = useState(0);

  const setCurrentUser = (profile: UserProfile) => {
    setCurrentUserState(profile);
  };

  const clearCurrentUser = () => {
    setCurrentUserState(null);
    setRivals([]);
    setChosenRivalId(null);
    setMostPlayedAgainst(null);
  };

  const awardPoints = (amount: number) => {
    setCurrentUserState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        points: Math.max(0, prev.points + amount),
        monthlyPoints: amount > 0 ? prev.monthlyPoints + amount : prev.monthlyPoints,
      };
    });
  };

  const addWin = () => {
    setCurrentUserState((prev) =>
      prev ? { ...prev, wins: prev.wins + 1, points: prev.points + 30, monthlyPoints: prev.monthlyPoints + 30 } : prev
    );
  };

  const addLoss = () => {
    setCurrentUserState((prev) =>
      prev ? { ...prev, losses: prev.losses + 1 } : prev
    );
  };

  const addDraw = () => {
    setCurrentUserState((prev) =>
      prev ? { ...prev, points: prev.points + 10, monthlyPoints: prev.monthlyPoints + 10 } : prev
    );
  };

  const resetMonthlyPoints = () => {
    setCurrentUserState((prev) => prev ? { ...prev, monthlyPoints: 0 } : prev);
  };

  const getNow = () => Date.now() + devDateOffset;

  return (
    <AppContext.Provider
      value={{
        currentUser, groups, rivals, chosenRivalId, mostPlayedAgainst,
        theme, devDateOffset,
        setCurrentUser, clearCurrentUser, setGroups, setRivals,
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
 * Returns: the AppState object with user, groups, rivals, theme, and all mutators.
 * Edge cases: throws an error when called outside an AppProvider.
 */
export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
