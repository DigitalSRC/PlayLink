import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthSessionState {
  session: Session | null;
  authLoading: boolean;
}

/**
 * Tracks the current Supabase auth session for the whole app: the session restored from
 * AsyncStorage on cold start, and any subsequent sign-in, sign-out, or token-refresh event.
 * This is the single source of truth for "is anyone signed in" — AppContext and the routing
 * gates both read from this rather than each maintaining their own auth state.
 * Parameters: none.
 * Returns: { session, authLoading } — session is null when signed out; authLoading is true
 * only while the initial getSession() restore is in flight on mount, and never becomes true
 * again afterward (an in-progress sign-in is tracked locally by the sign-in screen instead).
 * Edge cases: unsubscribes its auth-state listener on unmount so it never sets state on an
 * unmounted component.
 */
export const useAuthSession = (): AuthSessionState => {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, authLoading };
};
