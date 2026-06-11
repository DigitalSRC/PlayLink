import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

// ProfileCreation: Form screen for users to enter profile information (username, location, bracket).
// Inputs: None. Outputs: JSX element with three text input fields and a save button that returns to previous screen.
// State: username, location, bracket (all strings, updated via state setters on text input changes).
export default function ProfileCreation() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bracket, setBracket] = useState("");

  // Renders form with three input fields bound to state (username, location, bracket).
  // Each TextInput updates its corresponding state variable via onChangeText handler.
  // Save button calls router.back() to return to previous screen (does not persist data).
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Your Profile</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your username"
          placeholderTextColor="#999"
          value={username}
          onChangeText={setUsername}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your location"
          placeholderTextColor="#999"
          value={location}
          onChangeText={setLocation}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Bracket</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your bracket"
          placeholderTextColor="#999"
          value={bracket}
          onChangeText={setBracket}
        />
      </View>

      <Pressable style={styles.button} onPress={() => router.back()}>
        <Text style={styles.buttonText}>Save Profile</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 30,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});
