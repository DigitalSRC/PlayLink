import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/**
 * Renders the user profile setup form for the app.
 * The screen collects a username, location, and bracket so the user can continue into the group browsing flow.
 * It is designed to keep the form inputs visible and easy to edit on a phone screen.
 * Parameters: none.
 * Returns: a React Native screen element containing the input fields and save button.
 * Edge cases: the layout does not validate values until the save action runs.
 */
export default function ProfileCreation() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [location, setLocation] = useState("");
  const [bracket, setBracket] = useState("");

  /**
   * Saves the profile information and navigates to the browse screen when a username exists.
   * The username is passed as a route parameter so the browsing screen can personalize the view.
   * Parameters: none; uses the current component state values.
   * Returns: nothing directly; it may call router.push or show an alert.
   * Edge cases: if the username is blank, the function shows an alert and does not navigate.
   */
  const handleSaveProfile = () => {
    if (username.trim()) {
      router.push({
        pathname: "/browse-games",
        params: { username: username },
      });
    } else {
      alert("Please enter a username");
    }
  };

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

      <Pressable style={styles.button} onPress={handleSaveProfile}>
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
