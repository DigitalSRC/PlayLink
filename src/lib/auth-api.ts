import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

/** The shortest password a new account or a password change may use. The Supabase project's
 * own minimum (Authentication settings, and supabase/config.toml for local runs) must be at
 * least this; the server is what enforces it. Signing in is never checked against it, so an
 * account made under the older, shorter minimum can still sign in. */
export const MIN_PASSWORD_LENGTH = 10;

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

/**
 * Creates a new account with an email and password. This Supabase project has email
 * confirmation disabled, so a successful call establishes a session immediately — there's no
 * "check your email" step.
 * Parameters: email (the new account's email), password (plain text; Supabase's minimum length
 * requirement is enforced server-side; see MIN_PASSWORD_LENGTH).
 * Returns: a promise that resolves once the account is created and signed in; as with the OAuth
 * flows, the app's onAuthStateChange listener picks up the new session automatically.
 * Edge cases: throws if the email is already registered, if the password doesn't meet
 * Supabase's minimum length requirement, or on any other Supabase/network error.
 */
export const signUpWithEmail = async (email: string, password: string): Promise<void> => {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
};

/**
 * Signs in with an existing email/password account.
 * Parameters: email, password.
 * Returns: a promise that resolves once a session has been established; the app's
 * onAuthStateChange listener picks up the new session automatically.
 * Edge cases: throws on invalid credentials (Supabase returns the same generic error for a
 * wrong password vs. a nonexistent email, so the caller can't distinguish the two) or any other
 * Supabase/network error.
 */
export const signInWithEmail = async (email: string, password: string): Promise<void> => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

/** What updatePassword says when the current password is wrong. Exported so the screen and
 * the tests name the same sentence. */
export const WRONG_CURRENT_PASSWORD = 'Your current password is not right.';

/**
 * Checks that the signed-in player knows their own password, by signing the same account in
 * again with the account's email and the password typed. Used before anything a borrowed
 * unlocked phone (or a copied session) must not be able to do: changing the password, deleting
 * the account. The fresh sign-in also refreshes the token's record of when the password was
 * last entered, which the server's delete_my_account checks for itself.
 * Parameters: password (what the player typed as their current password).
 * Returns: a promise that resolves once the password is confirmed.
 * Edge cases: throws WRONG_CURRENT_PASSWORD when the password does not match; throws "Please
 * sign in again." when there is no session or the account has no email (an OAuth-only account
 * has no password to check); any other failure (no network, too many attempts) is rethrown as it
 * is, never reported as a wrong password. The session is replaced by a new one for the same player.
 */
const confirmCurrentPassword = async (password: string): Promise<void> => {
  const { data, error: userError } = await supabase.auth.getUser();
  const email = data?.user?.email;
  if (userError || !email) throw new Error('Please sign in again.');

  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password });
  if (checkError) {
    if (/invalid login credentials/i.test(checkError.message)) {
      throw new Error(WRONG_CURRENT_PASSWORD);
    }
    throw checkError;
  }
};

/**
 * Changes the password for the currently signed-in user, after checking they know the current
 * one. Supabase's updateUser needs only a live session, so without this check anyone holding an
 * unlocked phone (or a copied session) could set a new password and keep the account for good.
 * Parameters: currentPassword (what the player typed as their existing password), newPassword
 * (plain text; Supabase's minimum length requirement is enforced server-side; see
 * MIN_PASSWORD_LENGTH).
 * Returns: a promise that resolves once the password has been updated.
 * Edge cases: every failure of the check is as in confirmCurrentPassword, and changes nothing;
 * throws if the new password doesn't meet Supabase's minimum length.
 */
export const updatePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  await confirmCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

/**
 * Deletes the signed-in player's account for good: their login, profile, purchases, and seats.
 * The groups they were in carry on (the host role passes to another player, and a group left
 * empty is removed), and past rounds keep their results. The password is checked here first,
 * and the server's delete_my_account refuses on its own unless the password was entered in the
 * last 10 minutes, so a session alone can never delete an account.
 * Parameters: password (what the player typed as their current password).
 * Returns: a promise that resolves once the account is gone. The caller should then sign out
 * locally, since the session now belongs to nobody.
 * Edge cases: every failure of the password check is as in confirmCurrentPassword, and deletes
 * nothing; a refusal from the server (a group whose round can still be contested would be
 * removed by leaving it) is thrown with its plain-English message and deletes nothing.
 */
export const deleteAccount = async (password: string): Promise<void> => {
  await confirmCurrentPassword(password);
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
};
