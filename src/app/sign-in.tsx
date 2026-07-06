import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
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
import {
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../lib/auth-api";

// Google/Apple sign-in are fully built (see auth-api.ts) but deliberately not offered yet —
// each needs external console setup (a Google Cloud OAuth client, an Apple Developer Services
// ID) that hasn't been done. Email/password is the only sign-in method surfaced for now; flip
// this back on once that setup is complete, matching the same gate-with-a-flag pattern used
// elsewhere in this codebase for features waiting on external dependencies.
const OAUTH_ENABLED = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [mode, setMode] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

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
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
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
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setPendingProvider("google");
    try {
      await signInWithGoogle();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
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
      setError(err instanceof Error ? err.message : "Apple sign-in failed. Please try again.");
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
          <Text style={styles.brand}>Welcome to PlayLink!</Text>
          <Text style={styles.tagline}>Linking Players to play games!</Text>
        </View>

        <Animated.View
          style={[styles.footer, { transform: [{ translateY: formAnim }] }]}
        >
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TextInput
            style={[styles.input, !!emailError && styles.inputError]}
            placeholder="Email"
            placeholderTextColor="#666"
            value={email}
            onChangeText={(v) => { setEmail(v); if (emailError) setEmailError(""); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!isBusy}
          />
          {!!emailError && <Text style={styles.fieldErrorText}>{emailError}</Text>}

          <TextInput
            style={[styles.input, !!passwordError && styles.inputError]}
            placeholder="Password (min. 6 characters)"
            placeholderTextColor="#666"
            value={password}
            onChangeText={(v) => { setPassword(v); if (passwordError) setPasswordError(""); }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isBusy}
          />
          {!!passwordError && <Text style={styles.fieldErrorText}>{passwordError}</Text>}

          <Pressable
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
            onPress={() => {
              setError("");
              setEmailError("");
              setPasswordError("");
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F14",
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
    color: "#FFFFFF",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  tagline: {
    fontSize: 15,
    color: "#888",
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
    backgroundColor: "#1C1C24",
    borderWidth: 1,
    borderColor: "#2C2C38",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#FFF",
  },
  inputError: {
    borderColor: "#FF3B30",
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#FF3B30",
    fontWeight: "600",
    marginTop: -6,
  },
  toggleText: {
    fontSize: 13,
    color: "#007AFF",
    textAlign: "center",
    fontWeight: "600",
    marginTop: 2,
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
    borderColor: "#2C2C38",
  },
  appleButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
