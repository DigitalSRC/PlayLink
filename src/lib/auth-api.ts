import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

/**
 * Signs the user in with Google via Supabase's hosted OAuth flow. Opens Google's consent
 * screen in an in-app browser, waits for the `playlink://` redirect back into the app, and
 * exchanges the returned authorization code for a Supabase session (PKCE flow).
 * Parameters: none.
 * Returns: a promise that resolves once a session has been established; the app's
 * onAuthStateChange listener (see useAuthSession.ts) picks up the new session automatically,
 * so callers don't need to do anything with the resolved value.
 * Edge cases: if the user cancels or dismisses the browser sheet, this resolves normally
 * without establishing a session (not treated as an error) — the caller stays on the sign-in
 * screen. Throws if Supabase fails to produce an OAuth URL, if the redirect is missing an
 * authorization code, or if the code exchange itself fails.
 */
export const signInWithGoogle = async (): Promise<void> => {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return an OAuth URL for Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;

  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Google sign-in redirect did not include an authorization code.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
};

/**
 * Signs the user in with Apple using the native Sign in with Apple UI (not a web redirect),
 * per Apple's App Store guidance for apps that offer other third-party sign-in options.
 * Generates a random nonce, sends its SHA-256 hash to Apple, then hands Apple's returned
 * identity token and the original raw nonce to Supabase for verification.
 * Parameters: none.
 * Returns: a promise that resolves once a session has been established; as with Google, the
 * app's onAuthStateChange listener picks up the new session automatically.
 * Edge cases: iOS-only — callers must gate this behind `Platform.OS === 'ios'` since the
 * native module has no Android/web implementation. Resolves normally (no-op) if the user
 * cancels the native sign-in sheet. Throws if Apple doesn't return an identity token, or if
 * Supabase's verification of that token fails.
 */
export const signInWithApple = async (): Promise<void> => {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') {
      return;
    }
    throw err;
  }

  if (!credential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
};
