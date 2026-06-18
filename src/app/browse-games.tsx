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
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupLocation, setGroupLocation] = useState("");
  const [groupTime, setGroupTime] = useState("");
  const [playersNeeded, setPlayersNeeded] = useState("2");
  const [bracket, setBracket] = useState("1");

  const currentUserGroup = groups.find((group) =>
    group.players.some((player) => player.username === displayUsername)
  );
  const currentUserIsHost = currentUserGroup?.players.some(
    (player) => player.username === displayUsername && player.role === "Host"
  );

  const getGroupById = (groupId: number) =>
    groups.find((group) => group.id === groupId);

  const resetCreateForm = () => {
    setGroupName("");
    setGroupLocation("");
    setGroupTime("");
    setPlayersNeeded("2");
    setBracket("1");
  };

  const handleJoin = (groupId: number) => {
    const targetGroup = getGroupById(groupId);

    if (!targetGroup) {
      return;
    }

    if (currentUserGroup) {
      Alert.alert(
        "Already in a group",
        "Leave your current group before joining another one."
      );
      return;
    }

    if (targetGroup.players.length >= targetGroup.targetPlayers) {
      Alert.alert("Group is full", "This group already has enough players.");
      return;
    }

    const nextPlayerId = Date.now();
    const newPlayer = {
      id: nextPlayerId,
      username: displayUsername,
      bracket: targetGroup.bracket,
      location: targetGroup.location,
      role: "Member",
    };

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === targetGroup.id
          ? {
              ...group,
              players: [...group.players, newPlayer],
            }
          : group
      )
    );

    Alert.alert("Success", `You have joined ${targetGroup.name}.`);
  };

  const handleLeaveGroup = (groupId: number) => {
    const targetGroup = getGroupById(groupId);

    if (!targetGroup) {
      return;
    }

    const leavingPlayerId = targetGroup.players.find(
      (player) => player.username === displayUsername
    )?.id;

    if (typeof leavingPlayerId !== "number") {
      return;
    }

    const updatedPlayers = targetGroup.players.filter(
      (player) => player.id !== leavingPlayerId
    );

    const wasHost = targetGroup.players.some(
      (player) => player.id === leavingPlayerId && player.role === "Host"
    );

    if (updatedPlayers.length === 0) {
      setGroups((currentGroups) =>
        currentGroups.filter((group) => group.id !== targetGroup.id)
      );
      Alert.alert("Group removed", "Your group has been removed.");
      return;
    }

    if (wasHost) {
      const nextHost = updatedPlayers[0];
      updatedPlayers[0] = {
        ...nextHost,
        role: "Host",
      };
    }

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === targetGroup.id
          ? {
              ...group,
              players: updatedPlayers,
            }
          : group
      )
    );

    Alert.alert(
      "Left group",
      wasHost
        ? "You left the group. The next player is now the host."
        : "You left the group."
    );
  };

  const handleBackToHome = () => {
    router.replace("/");
  };

  const handleCreateGroup = () => {
    if (currentUserGroup) {
      Alert.alert(
        "Already in a group",
        "Leave your current group before creating another one."
      );
      return;
    }

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
    resetCreateForm();

    Alert.alert(
      "Group Posted",
      `${newGroup.name} is now looking for players near ${newGroup.location}.`
    );
  };

  const startEditingGroup = (group: Group) => {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupLocation(group.location);
    setGroupTime(group.time);
    setPlayersNeeded(String(group.targetPlayers));
    setBracket(String(group.bracket));
  };

  const handleSaveGroupEdit = (groupId: number) => {
    const targetGroup = getGroupById(groupId);

    if (!targetGroup) {
      return;
    }

    if (!currentUserIsHost || targetGroup.players.every((player) => player.username !== displayUsername)) {
      Alert.alert("Not allowed", "Only the host can edit this group.");
      return;
    }

    const parsedPlayersNeeded = Math.max(1, Number(playersNeeded) || targetGroup.targetPlayers);
    const parsedBracket = Math.max(1, Number(bracket) || targetGroup.bracket);

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              name: groupName.trim() || group.name,
              targetPlayers: parsedPlayersNeeded,
              bracket: parsedBracket,
              location: groupLocation.trim() || group.location,
              time: groupTime.trim() || group.time,
            }
          : group
      )
    );

    setEditingGroupId(null);
    Alert.alert("Group updated", "Your group details have been updated.");
  };

  const handleMakeHost = (groupId: number, playerId: number) => {
    const targetGroup = getGroupById(groupId);

    if (!targetGroup) {
      return;
    }

    if (!currentUserIsHost || targetGroup.players.every((player) => player.username !== displayUsername)) {
      Alert.alert("Not allowed", "Only the host can change the host.");
      return;
    }

    setGroups((currentGroups) =>
      currentGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              players: group.players.map((player) => ({
                ...player,
                role: player.id === playerId ? "Host" : player.role === "Host" ? "Member" : player.role,
              })),
            }
          : group
      )
    );

    Alert.alert("Host updated", "The group host has been changed.");
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
          const isEditing = editingGroupId === game.id;
          const playersCount = game.players.length;
          const isCurrentUserInGroup = game.players.some(
            (player) => player.username === displayUsername
          );
          const isCurrentUserHost = game.players.some(
            (player) => player.username === displayUsername && player.role === "Host"
          );

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
                      <View style={styles.playerActions}>
                        <Text style={styles.playerLocation}>{player.location}</Text>
                        {isCurrentUserHost && player.username !== displayUsername && (
                          <Pressable
                            style={styles.hostButton}
                            onPress={() => handleMakeHost(game.id, player.id)}
                          >
                            <Text style={styles.hostButtonText}>Make Host</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}

                  {isCurrentUserHost && (
                    <View style={styles.editActions}>
                      {isEditing ? (
                        <>
                          <View style={styles.inputContainer}>
                            <Text style={styles.label}>Edit group name</Text>
                            <TextInput
                              style={styles.input}
                              value={groupName}
                              onChangeText={setGroupName}
                            />
                          </View>
                          <View style={styles.inputContainer}>
                            <Text style={styles.label}>Edit location</Text>
                            <TextInput
                              style={styles.input}
                              value={groupLocation}
                              onChangeText={setGroupLocation}
                            />
                          </View>
                          <View style={styles.inputContainer}>
                            <Text style={styles.label}>Edit time</Text>
                            <TextInput
                              style={styles.input}
                              value={groupTime}
                              onChangeText={setGroupTime}
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
                              />
                            </View>
                            <View style={styles.halfInput}>
                              <Text style={styles.label}>Bracket</Text>
                              <TextInput
                                style={styles.input}
                                value={bracket}
                                onChangeText={setBracket}
                                keyboardType="numeric"
                              />
                            </View>
                          </View>
                          <View style={styles.inlineActions}>
                            <Pressable
                              style={styles.saveButton}
                              onPress={() => handleSaveGroupEdit(game.id)}
                            >
                              <Text style={styles.saveButtonText}>Save</Text>
                            </Pressable>
                            <Pressable
                              style={styles.cancelButton}
                              onPress={() => setEditingGroupId(null)}
                            >
                              <Text style={styles.cancelButtonText}>Cancel</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <Pressable
                          style={styles.editButton}
                          onPress={() => startEditingGroup(game)}
                        >
                          <Text style={styles.editButtonText}>Edit Group</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.cardActions}>
                {isCurrentUserInGroup ? (
                  <Pressable
                    style={styles.leaveButton}
                    onPress={() => handleLeaveGroup(game.id)}
                  >
                    <Text style={styles.leaveButtonText}>
                      {isCurrentUserHost ? "Leave & Transfer" : "Leave Group"}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={styles.joinButton}
                    onPress={() => handleJoin(game.id)}
                  >
                    <Text style={styles.joinButtonText}>Join</Text>
                  </Pressable>
                )}
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
  playerActions: {
    flexDirection: "row",
    alignItems: "center",
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
    marginRight: 8,
  },
  hostButton: {
    backgroundColor: "#F5A623",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  hostButtonText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
  },
  editActions: {
    marginTop: 10,
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    backgroundColor: "#34C759",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  editButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  saveButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
  cancelButton: {
    backgroundColor: "#E5E5EA",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: "#333",
    fontSize: 13,
    fontWeight: "600",
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
  leaveButton: {
    backgroundColor: "#FF6B6B",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  leaveButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
