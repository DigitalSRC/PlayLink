import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useRef, useState } from "react";
import { ThemeColors, useThemeColors } from "../utils/theme-utils";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { showDialog } from "../components/AppDialog";
import { showToast } from "../components/AppToast";
import { MIN_AGE, PRIVACY_URL, TERMS_URL } from "../data/legal";
import {
  MIN_PASSWORD_LENGTH,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/auth-api";
import { playerErrorMessage } from "../utils/error-utils";

// Google/Apple sign-in are fully built (see auth-api.ts) but deliberately not offered yet —
// each needs external console setup (a Google Cloud OAuth client, an Apple Developer Services
// ID) that hasn't been done. Email/password is the only sign-in method surfaced for now; flip
// this back on once that setup is complete, matching the same gate-with-a-flag pattern used
// elsewhere in this codebase for features waiting on external dependencies.
const OAUTH_ENABLED = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Turns a failed sign-in or sign-up into a message a first-time player can act on. Supabase
 * answers a wrong password and an email with no account with the same "Invalid login
 * credentials" text, which reads like a typo to someone who simply hasn't made an account yet,
 * so that case is reworded to point at the Create an account button.
 * Parameters: err (whatever the auth call threw), mode (which form was submitted).
 * Returns: the text to show above the form.
 * Edge cases: any other error from the sign-in service keeps its own message, but one the
 * database produced is replaced by a generic retry message (see playerErrorMessage); a
 * non-Error value gets the same generic message; the rewording applies only to sign-in, never
 * to sign-up.
 */
const describeAuthError = (err: unknown, mode: "signIn" | "signUp"): string => {
  const fallback = "Something went wrong. Please try again.";
  if (!(err instanceof Error)) return fallback;
  if (mode === "signIn" && /invalid login credentials/i.test(err.message)) {
    return "That email and password don't match an account. New to PlayLink? Tap “Create an account” below.";
  }
  return playerErrorMessage(err, fallback);
};

/**
 * The unauthenticated landing screen: PlayLink branding plus an email/password form that can
 * either create a new account or sign in to an existing one. Reached from index.tsx whenever
 * there is no Supabase session. Does not navigate on success itself — the routing gate in
 * index.tsx and (tabs)/_layout.tsx reacts automatically once the auth-state listener picks up
 * the new session, sending the user to profile-creation or straight to the tabs depending on
 * whether a profiles row already exists for them.
 * Parameters: none.
 * Returns: a React Native screen with branding, an email/password form with a sign-up/sign-in
 * mode toggle, an inline loading spinner while a submission is in flight, and an inline error
 * message if one fails. Also renders Google/Apple buttons when OAUTH_ENABLED is true. The form
 * sits near the top of the screen rather than pinned to the bottom, and the whole layout is
 * wrapped in a KeyboardAvoidingView + ScrollView so the on-screen keyboard can never cover the
 * inputs, even though the higher placement already makes that unlikely on typical screen sizes.
 * Edge cases: the submit button is enabled once both fields are non-empty, but a malformed
 * email or a too-short password is only caught when the button is actually pressed — showing
 * a red inline error under the offending field plus an error haptic, rather than just leaving
 * the button silently disabled with no explanation. Toggling between sign-up/sign-in animates
 * the form (slide + haptic tick) purely so the mode switch reads as "something happened," even
 * though it's the same screen underneath. On success, explicitly navigates back to "/" rather
 * than relying on the auth-state listener alone — index.tsx and /sign-in are sibling routes, so
 * index.tsx's routing gate only re-evaluates when it's remounted, not just because session state
 * changed somewhere else while it's unmounted.
 */
export default function SignIn() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Defaults to signIn rather than signUp: this screen is reached both on a fresh install and
  // whenever an existing session ends (e.g. signing out), and the latter is the far more common
  // case in practice. Defaulting to signUp meant a returning user who typed their existing
  // credentials without first tapping "Already have an account?" would call signUp() instead of
  // signInWithPassword() - which, for an email that already exists, doesn't throw a catchable
  // error here but also doesn't establish a real session, silently bouncing them back to this
  // screen with no explanation.
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const formAnim = useRef(new Animated.Value(0)).current;

  // Purely cosmetic: makes toggling sign-up/sign-in feel like it navigated somewhere, even
  // though it's the same screen and fields underneath. See the toggle Pressable below.
  const animateModeSwitch = () => {
    formAnim.setValue(24);
    Animated.spring(formAnim, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 10,
    }).start();
  };

  // Gate on non-empty rather than full validity so the button is always pressable - actual
  // format/length problems are caught inside handleSubmit and surfaced as inline errors, not by
  // silently disabling the button with no explanation (see the "no email" bug this was added for).
  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setError("");
    setEmailError("");
    setPasswordError("");

    const trimmedEmail = email.trim();
    let hasValidationError = false;
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Enter a valid email address with a valid extension (e.g. name@example.com).");
      hasValidationError = true;
    }
    // Only a new account is held to the minimum: an account made under the older, shorter
    // minimum must still be able to sign in.
    if (mode === "signUp" && password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      hasValidationError = true;
    }
    if (mode === "signUp" && !acceptedTerms) {
      setTermsError(`Please confirm you are ${MIN_AGE} or older and accept the Terms and Privacy Policy.`);
      hasValidationError = true;
    }
    if (hasValidationError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "signUp") {
        await signUpWithEmail(trimmedEmail, password);
      } else {
        await signInWithEmail(trimmedEmail, password);
      }
      router.replace("/");
    } catch (err) {
      setError(describeAuthError(err, mode));
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Sends a password-reset link to the email in the form, after the player confirms the address.
   * Parameters: none; reads the typed email from state.
   * Returns: void; the request runs only if the player confirms.
   * Edge cases: with no valid email typed, says so under the email field instead; the same
   * "if there's an account, a link is on its way" message shows whether or not the email has an
   * account, so the form can't be used to find out who is registered; a refusal (too many
   * requests, no network) is shown above the form; a second tap while sending is ignored.
   */
  const handleForgotPassword = () => {
    if (sendingReset || isSubmitting) return;
    setError("");
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Type your email above, then tap “Forgot password?” again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    showDialog("Reset your password?", `We’ll email a link to ${trimmedEmail}. Open it on this device.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send Link",
        onPress: async () => {
          setSendingReset(true);
          try {
            await requestPasswordReset(trimmedEmail);
            showToast("Check your email", "If that email has an account, a reset link is on its way.");
          } catch (err) {
            setError(playerErrorMessage(err, "Could not send the link. Please try again in a minute."));
          } finally {
            setSendingReset(false);
          }
        },
      },
    ]);
  };

  const handleGoogle = async () => {
    setError("");
    setPendingProvider("google");
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (err) {
      setError(playerErrorMessage(err, "Google sign-in failed. Please try again."));
    } finally {
      setPendingProvider(null);
    }
  };

  const handleApple = async () => {
    setError("");
    setPendingProvider("apple");
    try {
      await signInWithApple();
      router.replace("/");
    } catch (err) {
      setError(playerErrorMessage(err, "Apple sign-in failed. Please try again."));
    } finally {
      setPendingProvider(null);
    }
  };

  const isBusy = isSubmitting || pendingProvider !== null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>{mode === "signIn" ? "Sign In to PlayLink" : "Welcome to PlayLink!"}</Text>
          <Text style={styles.tagline}>Linking Players. Filling Tables.</Text>
          <Text style={styles.pitch}>
            Find game nights at stores near you, fill a table, and earn points for playing.
          </Text>
        </View>

        <Animated.View
          style={[styles.footer, { transform: [{ translateY: formAnim }] }]}
        >
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            testID="sign-in-email-input"
            style={[styles.input, !!emailError && styles.inputError]}
            placeholder="Email"
            placeholderTextColor={colors.placeholder}
            value={email}
            onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(""); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isBusy}
          />
          {!!emailError && <Text style={styles.fieldErrorText}>{emailError}</Text>}

          <View style={styles.passwordRow}>
            <TextInput
              testID="sign-in-password-input"
              style={[styles.input, styles.passwordInput, !!passwordError && styles.inputError]}
              placeholder={mode === "signUp" ? `Password (min. ${MIN_PASSWORD_LENGTH} characters)` : "Password"}
              placeholderTextColor={colors.placeholder}
              value={password}
              onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(""); }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isBusy}
            />
            <Pressable
              testID="sign-in-password-toggle"
              style={styles.passwordToggle}
              onPress={() => setShowPassword((v) => !v)}
              disabled={isBusy}
            >
              <Text style={styles.passwordToggleIcon}>{showPassword ? "🙈" : "👁️"}</Text>
            </Pressable>
          </View>
          {!!passwordError && <Text style={styles.fieldErrorText}>{passwordError}</Text>}

          {mode === "signIn" && (
            <Pressable
              testID="sign-in-forgot-password"
              style={styles.forgotLink}
              onPress={handleForgotPassword}
              disabled={isBusy || sendingReset}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.linkText}>{sendingReset ? "Sending…" : "Forgot password?"}</Text>
            </Pressable>
          )}

          {mode === "signUp" && (
            <>
              <Pressable
                testID="sign-in-terms-checkbox"
                style={styles.termsRow}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAcceptedTerms((v) => !v);
                  setTermsError("");
                }}
                disabled={isBusy}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
              >
                <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked, !!termsError && styles.inputError]}>
                  {acceptedTerms && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.termsText}>
                  I am {MIN_AGE} or older and accept the{" "}
                  <Text style={styles.linkText} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>Terms</Text>
                  {" "}and{" "}
                  <Text style={styles.linkText} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>Privacy Policy</Text>.
                </Text>
              </Pressable>
              {!!termsError && <Text style={styles.fieldErrorText}>{termsError}</Text>}
            </>
          )}

          <Pressable
            testID="sign-in-submit-button"
            style={[styles.button, styles.submitButton, (!canSubmit || isBusy) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || isBusy}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === "signUp" ? "Create Account" : "Sign In"}
              </Text>
            )}
          </Pressable>

          <Pressable
            testID="sign-in-mode-toggle"
            style={[styles.button, styles.toggleButton, isBusy && styles.buttonDisabled]}
            onPress={() => {
              setError("");
              setEmailError("");
              setPasswordError("");
              setTermsError("");
              Haptics.selectionAsync();
              animateModeSwitch();
              setMode(mode === "signUp" ? "signIn" : "signUp");
            }}
            disabled={isBusy}
          >
            <Text style={styles.toggleText}>
              {mode === "signUp"
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </Text>
          </Pressable>

          {OAUTH_ENABLED && (
            <>
              <Pressable
                style={[styles.button, styles.googleButton, isBusy && styles.buttonDisabled]}
                onPress={handleGoogle}
                disabled={isBusy}
              >
                {pendingProvider === "google" ? (
                  <ActivityIndicator color="#1C1C24" />
                ) : (
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                )}
              </Pressable>

              {Platform.OS === "ios" && (
                <Pressable
                  style={[styles.button, styles.appleButton, isBusy && styles.buttonDisabled]}
                  onPress={handleApple}
                  disabled={isBusy}
                >
                  {pendingProvider === "apple" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.appleButtonText}>Continue with Apple</Text>
                  )}
                </Pressable>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Built per theme, like the signed-in screens: every neutral and tinted color comes from
// ThemeColors, so this screen follows the light/dark setting too.
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingTop: 72,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    color: c.textPrimary,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  tagline: {
    fontSize: 15,
    color: c.textSecondary,
    marginTop: 10,
    textAlign: "center",
  },
  footer: {
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#FF3B30",
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "600",
  },
  input: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: c.textPrimary,
  },
  inputError: {
    borderColor: "#FF3B30",
  },
  passwordRow: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    paddingRight: 48,
  },
  passwordToggle: {
    position: "absolute",
    right: 4,
    height: "100%",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  passwordToggleIcon: {
    fontSize: 18,
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#FF3B30",
    fontWeight: "600",
    marginTop: -6,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  linkText: {
    color: "#007AFF",
    fontWeight: "600",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: c.textBody,
    lineHeight: 19,
  },
  pitch: {
    fontSize: 14,
    color: c.textBody,
    marginTop: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // The way to the other form is a full-width outlined button, not a text link: a first-time
  // player lands on Sign In and has to be able to find Create an account at a glance.
  toggleButton: {
    borderWidth: 1.5,
    borderColor: "#007AFF",
    paddingVertical: 14,
  },
  toggleText: {
    fontSize: 15,
    color: "#007AFF",
    textAlign: "center",
    fontWeight: "700",
  },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButton: {
    backgroundColor: "#007AFF",
    marginTop: 4,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
  },
  googleButtonText: {
    color: "#1C1C24",
    fontSize: 16,
    fontWeight: "700",
  },
  appleButton: {
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: c.border,
  },
  appleButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
