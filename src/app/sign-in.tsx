import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { signInWithApple, signInWithGoogle } from "../lib/auth-api";

/**
 * The unauthenticated landing screen: PlayLink branding plus "Continue with Google" and
 * (iOS only) "Continue with Apple" buttons. Reached from index.tsx whenever there is no
 * Supabase session. Does not navigate on success itself — the routing gate in index.tsx and
 * (tabs)/_layout.tsx reacts automatically once the auth-state listener picks up the new
 * session, sending the user to profile-creation or straight to the tabs depending on whether
 * a profiles row already exists for them.
 * Parameters: none.
 * Returns: a React Native screen with branding, provider buttons, an inline loading spinner
 * while a sign-in is in flight, and an inline error message if one fails.
 * Edge cases: both buttons are disabled while any sign-in is in progress to prevent a second
 * concurrent attempt; a user cancelling the provider's UI is treated as a silent no-op by
 * auth-api.ts, not surfaced as an error here.
 */
export default function SignIn() {
  const [pendingProvider, setPendingProvider] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState("");

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

  const isBusy = pendingProvider !== null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>PlayLink</Text>
        <Text style={styles.tagline}>Find your table. Track your rivals.</Text>
      </View>

      <View style={styles.footer}>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

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
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
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
