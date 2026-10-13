import 'react-native-url-polyfill/auto';
import './crypto-polyfill';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { makeChunkedSecureStorage } from './secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

// app.json's web.output "static" prerenders routes in a Node process with no `window`/
// `document`, distinct from both native (also no `window`, but always wants AsyncStorage) and
// a real browser (Platform.OS is also 'web', but `window` exists). Passing a truthy `storage`
// makes GoTrueClient trust it unconditionally, so on the Node prerender pass AsyncStorage's
// web shim would try to touch `localStorage` and crash the whole render — passing `undefined`
// there instead lets GoTrueClient fall back to its own SSR-safe in-memory storage.
const isServerSideWeb = Platform.OS === 'web' && typeof window === 'undefined';

// On a phone the session goes in the device's secure store (Keychain / Keystore), not in
// AsyncStorage, which is a plain file a backup or a rooted phone can read. A session saved in
// AsyncStorage by an older build is moved across the first time it is read. A browser has no
// secure store, so the web build keeps AsyncStorage (localStorage underneath).
const sessionStorage =
  Platform.OS === 'web'
    ? AsyncStorage
    : makeChunkedSecureStorage(
        {
          getItem: (key) => SecureStore.getItemAsync(key),
          setItem: (key, value) => SecureStore.setItemAsync(key, value),
          removeItem: (key) => SecureStore.deleteItemAsync(key),
        },
        AsyncStorage
      );

/**
 * The single Supabase client instance used everywhere in the app for auth and database access.
 * Sessions are persisted (the device's secure store on a phone, AsyncStorage's web shim in the
 * browser - see sessionStorage above) so a signed-in user stays signed in across app restarts;
 * the Node-side static-prerender pass
 * uses Supabase's own safe in-memory fallback instead (see isServerSideWeb above), since there
 * is nothing to persist across a single server-side render anyway.
 * `detectSessionInUrl` is disabled because native has no browser URL bar to parse, and
 * `flowType: 'pkce'` is required for the OAuth redirect flow used by Google sign-in.
 * Parameters: none — configured entirely from EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY.
 * Returns: not applicable — this is a module-level singleton, not a function.
 * Edge cases: throws at import time (module load) if the env vars above are missing, so a
 * misconfigured .env fails immediately at startup instead of surfacing as a cryptic network error later.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isServerSideWeb ? undefined : sessionStorage,
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
