import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
 * message if one fails. Also renders Google/Apple buttons when OAUTH_ENABLED is true.
 * Edge cases: the submit button is disabled while a request is in progress or the form is
 * incomplete; validates email shape and a 6-character password minimum client-side before
 * ever calling Supabase, so obviously-invalid input never round-trips to the server.
 */
export default function SignIn() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signUp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 6;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      if (mode === "signUp") {
        await signUpWithEmail(email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apple sign-in failed. Please try again.");
    } finally {
      setPendingProvider(null);
    }
  };

  const isBusy = isSubmitting || pendingProvider !== null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>PlayLink</Text>
        <Text style={styles.tagline}>Find your table. Track your rivals.</Text>
      </View>

      <View style={styles.footer}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          editable={!isBusy}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min. 6 characters)"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
        />

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
          onPress={() => { setError(""); setMode(mode === "signUp" ? "signIn" : "signUp"); }}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F0F14",
    justifyContent: "space-between",
    paddingTop: 96,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
  },
  brand: {
    fontSize: 34,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1,
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
