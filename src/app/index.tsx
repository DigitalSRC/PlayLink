import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Displays the app landing screen and directs the user into profile setup.
 * This component explains the app purpose, shows the brand text, and provides a button for starting the onboarding flow.
 * The view is intentionally simple and centered so the user can quickly move to the next screen.
 * Parameters: none.
 * Returns: a React Native screen element with the welcome text and a navigation button.
 * Edge cases: none beyond a missing router instance, which would prevent navigation.
 */
export default function Index() {
  const router = useRouter();

  /**
   * Navigates to the profile creation screen when the user presses the main button.
   * Parameters: none.
   * Returns: nothing directly; it triggers a router navigation action.
   * Edge cases: if the router is unavailable, the button press cannot navigate.
   */
  return (
    <View style={styles.container}>
      <Text style={styles.mainTitle}>Welcome to PlayLink</Text>
      <Text style={styles.subtitle}>Silvenari.Co</Text>
      <Pressable style={styles.button} onPress={() => router.push("/profile-creation")}>
        <Text style={styles.buttonText}>Create Profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 40,
    opacity: 0.7,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
