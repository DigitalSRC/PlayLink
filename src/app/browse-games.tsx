import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Group, HARDCODED_GROUPS } from "../data/groups";

export default function BrowseGames() {
  const router = useRouter();
  const { username } = useLocalSearchParams();
  const displayUsername = typeof username === "string" ? username : "Player";
  const [groups, setGroups] = useState<Group[]>(HARDCODED_GROUPS);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedGroupId, setExpandedGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupLocation, setGroupLocation] = useState("");
  const [groupTime, setGroupTime] = useState("");
  const [playersNeeded, setPlayersNeeded] = useState("2");
  const [bracket, setBracket] = useState("1");

  const handleJoin = (groupName: string) => {
    Alert.alert("Success", `You have joined ${groupName}.`);
  };

  const handleBackToHome = () => {
    router.replace("/");
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || !groupLocation.trim()) {
      Alert.alert("Missing Info", "Please add a group name and nearby location.");
      return;
    }

    const parsedPlayersNeeded = Number(playersNeeded) || 2;
    const parsedBracket = Number(bracket) || 1;

    const newGroup: Group = {
      id: Date.now(),
      name: groupName.trim(),
      players: [
        {
          id: Date.now() + 1,
          username: displayUsername,
          bracket: parsedBracket,
          location: groupLocation.trim(),
          role: "Host",
        },
      ],
      targetPlayers: parsedPlayersNeeded,
      bracket: parsedBracket,
      location: groupLocation.trim(),
      time: groupTime.trim() || "This week",
    };

    setGroups((currentGroups) => [newGroup, ...currentGroups]);
    setShowCreateForm(false);
    setGroupName("");
    setGroupLocation("");
    setGroupTime("");
    setPlayersNeeded("2");
    setBracket("1");

    Alert.alert(
      "Group Posted",
      `${newGroup.name} is now looking for players near ${newGroup.location}.`
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerPlayerName}>{displayUsername}</Text>
        <Pressable style={styles.backButton} onPress={handleBackToHome}>
          <Text style={styles.backButtonText}>Home</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.pageTitle}>Browse Open Games</Text>
        <Pressable
          style={styles.createButton}
          onPress={() => setShowCreateForm((current) => !current)}
        >
          <Text style={styles.createButtonText}>
            {showCreateForm ? "Close" : "Create Group"}
          </Text>
        </Pressable>
      </View>

      {showCreateForm && (
        <View style={styles.createForm}>
          <Text style={styles.formTitle}>Post a group looking for players</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Group name</Text>
            <TextInput
              style={styles.input}
              value={groupName}
              onChangeText={setGroupName}
              placeholder="e.g. Saturday Draft Crew"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nearby area</Text>
            <TextInput
              style={styles.input}
              value={groupLocation}
              onChangeText={setGroupLocation}
              placeholder="e.g. Downtown Seattle"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>When</Text>
            <TextInput
              style={styles.input}
              value={groupTime}
              onChangeText={setGroupTime}
              placeholder="e.g. Saturday · 6:30 PM"
            />
          </View>

          <View style={styles.rowInputs}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Players needed</Text>
              <TextInput
                style={styles.input}
                value={playersNeeded}
                onChangeText={setPlayersNeeded}
                keyboardType="numeric"
                placeholder="2"
              />
            </View>

            <View style={styles.halfInput}>
              <Text style={styles.label}>Bracket</Text>
              <TextInput
                style={styles.input}
                value={bracket}
                onChangeText={setBracket}
                keyboardType="numeric"
                placeholder="1"
              />
            </View>
          </View>

          <Pressable style={styles.submitButton} onPress={handleCreateGroup}>
            <Text style={styles.submitButtonText}>Post Group</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.gamesList} contentContainerStyle={styles.gamesListContent}>
        {groups.map((game) => {
          const isExpanded = expandedGroupId === game.id;
          const playersCount = game.players.length;

          return (
            <View key={game.id} style={styles.gameCard}>
              <Pressable
                style={styles.groupHeader}
                onPress={() =>
                  setExpandedGroupId((current) =>
                    current === game.id ? null : game.id
                  )
                }
              >
                <View style={styles.gameInfo}>
                  <Text style={styles.gameName}>{game.name}</Text>
                  <Text style={styles.gameDetails}>
                    {playersCount} of {game.targetPlayers} players · Bracket {game.bracket}
                  </Text>
                  <Text style={styles.gameDetails}>
                    {game.location} · {game.time}
                  </Text>
                </View>
                <Text style={styles.expandIcon}>{isExpanded ? "−" : "+"}</Text>
              </Pressable>

              {isExpanded && (
                <View style={styles.rosterContainer}>
                  <Text style={styles.rosterTitle}>Players in this group</Text>
                  {game.players.map((player) => (
                    <View key={player.id} style={styles.playerRow}>
                      <View>
                        <Text style={styles.playerName}>{player.username}</Text>
                        <Text style={styles.playerMeta}>
                          {player.role} · Bracket {player.bracket}
                        </Text>
                      </View>
                      <Text style={styles.playerLocation}>{player.location}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.cardActions}>
                <Pressable style={styles.joinButton} onPress={() => handleJoin(game.name)}>
                  <Text style={styles.joinButtonText}>Join</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
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
  headerPlayerName: {
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
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    flexShrink: 1,
  },
  createButton: {
    backgroundColor: "#34C759",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  createButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  createForm: {
    backgroundColor: "white",
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 12,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  submitButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    marginBottom: 2,
  },
  expandIcon: {
    fontSize: 22,
    fontWeight: "700",
    color: "#007AFF",
    marginLeft: 10,
  },
  rosterContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  rosterTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  playerName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  playerMeta: {
    fontSize: 12,
    color: "#666",
  },
  playerLocation: {
    fontSize: 12,
    color: "#666",
  },
  cardActions: {
    alignItems: "flex-end",
    marginTop: 12,
  },
  joinButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  joinButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
