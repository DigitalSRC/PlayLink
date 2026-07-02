import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

/**
 * The single Supabase client instance used everywhere in the app for auth and database access.
 * Sessions are persisted to AsyncStorage so a signed-in user stays signed in across app restarts.
 * `detectSessionInUrl` is disabled because React Native has no browser URL bar to parse, and
 * `flowType: 'pkce'` is required for the OAuth redirect flow used by Google sign-in.
 * Parameters: none — configured entirely from EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY.
 * Returns: not applicable — this is a module-level singleton, not a function.
 * Edge cases: throws at import time (module load) if the env vars above are missing, so a
 * misconfigured .env fails immediately at startup instead of surfacing as a cryptic network error later.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

let autoRefreshRegistered = false;

/**
 * Wires Supabase's auth token auto-refresh to the app's foreground/background state.
 * Supabase's own guidance for React Native: refreshing tokens while the app is backgrounded
 * wastes battery and can throw, so this starts the refresh timer when the app becomes active
 * and stops it when the app is backgrounded or inactive.
 * Parameters: none.
 * Returns: void.
 * Edge cases: safe to call more than once (e.g. across fast-refresh reloads in development) —
 * a module-level guard ensures the AppState listener is only attached a single time.
 */
export const registerSupabaseAutoRefresh = (): void => {
  if (autoRefreshRegistered) return;
  autoRefreshRegistered = true;

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
};
