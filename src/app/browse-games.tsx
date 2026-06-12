import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface Game {
  id: number;
  name: string;
  players: number;
  bracket: number;
}

const HARDCODED_GAMES: Game[] = [
  {
    id: 1,
    name: "Dragon Slayers",
    players: 3,
    bracket: 2,
  },
  {
    id: 2,
    name: "The Midnight Guild",
    players: 4,
    bracket: 5,
  },
  {
    id: 3,
    name: "Frost Peak Adventurers",
    players: 2,
    bracket: 1,
  },
];

export default function BrowseGames() {
  const router = useRouter();
  const { username } = useLocalSearchParams();
  const displayUsername = typeof username === "string" ? username : "Player";

  // Handle joining an open game. Window popup for joining is added here.
  const handleJoin = (groupName: string) => {
    // TODO: Add window popup for joining the game
    Alert.alert("Success", `You have joined ${groupName}.`);
  };

  const handleBackToHome = () => {
    router.replace("/");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.playerName}>{displayUsername}</Text>
        <Pressable style={styles.backButton} onPress={handleBackToHome}>
          <Text style={styles.backButtonText}>Home</Text>
        </Pressable>
      </View>

      {/* Title */}
      <Text style={styles.pageTitle}>Browse Open Games</Text>

      {/* Games List */}
      <ScrollView style={styles.gamesList} contentContainerStyle={styles.gamesListContent}>
        {HARDCODED_GAMES.map((game) => (
          <View key={game.id} style={styles.gameCard}>
            <View style={styles.gameInfo}>
              <Text style={styles.gameName}>{game.name}</Text>
              <Text style={styles.gameDetails}>
                {game.players} Players • Bracket {game.bracket}
              </Text>
            </View>
            <Pressable
              style={styles.joinButton}
              onPress={() => handleJoin(game.name)}
            >
              <Text style={styles.joinButtonText}>Join</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
  },
  playerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  backButton: {
    backgroundColor: "#FF6B6B",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  backButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
    color: "#333",
  },
  gamesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  gamesListContent: {
    paddingBottom: 30,
  },
  gameCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 6,
  },
  gameDetails: {
    fontSize: 13,
    color: "#666",
  },
  joinButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginLeft: 12,
  },
  joinButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
