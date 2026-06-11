import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

// Index: Home/welcome screen displayed when app launches. Shows branding and navigation button.
// Inputs: None. Outputs: JSX element with centered welcome message and "Create Profile" button that navigates to profile-creation screen.
export default function Index() {
  const router = useRouter();

  // Renders welcome screen with title, subtitle, and navigation button.
  // Button triggers router.push() to navigate to /profile-creation route when pressed.
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
