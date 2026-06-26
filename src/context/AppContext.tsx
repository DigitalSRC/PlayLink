import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserProfile } from '../data/types';
import { Group, HARDCODED_GROUPS } from '../data/groups';

interface AppState {
  currentUser: UserProfile | null;
  groups: Group[];
  rivals: UserProfile[];
  chosenRivalId: number | null;
  setCurrentUser: (profile: UserProfile) => void;
  clearCurrentUser: () => void;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  setRivals: (rivals: UserProfile[]) => void;
  setChosenRivalId: (id: number) => void;
  awardXP: (amount: number) => void;
}

const AppContext = createContext<AppState | null>(null);

/**
 * Provides global app state to all child screens.
 * Holds the current user profile, group list, and computed rivals.
 * Parameters: children (React tree to wrap).
 * Returns: a context provider element.
 * Edge cases: throws if useApp is called outside this provider.
 */
export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>(HARDCODED_GROUPS);
  const [rivals, setRivals] = useState<UserProfile[]>([]);
  const [chosenRivalId, setChosenRivalId] = useState<number | null>(null);

  const setCurrentUser = (profile: UserProfile) => {
    setCurrentUserState(profile);
  };

  const clearCurrentUser = () => {
    setCurrentUserState(null);
    setRivals([]);
    setChosenRivalId(null);
  };

  const awardXP = (amount: number) => {
    setCurrentUserState((prev) =>
      prev ? { ...prev, xp: prev.xp + amount } : prev
    );
  };

  return (
    <AppContext.Provider
      value={{ currentUser, groups, rivals, chosenRivalId, setCurrentUser, clearCurrentUser, setGroups, setRivals, setChosenRivalId, awardXP }}
    >
      {children}
    </AppContext.Provider>
  );
};

/**
 * Returns the app-wide state from the nearest AppProvider.
 * Parameters: none.
 * Returns: the AppState object with user, groups, rivals, and mutators including clearCurrentUser.
 * Edge cases: throws an error when called outside an AppProvider.
 */
export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
