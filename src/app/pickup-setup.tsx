import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

/**
 * Setup screen for an ad-hoc pickup game with no formal group required.
 * Lets the user add between 2 and 8 players by name, then launches the life counter in pickup mode.
 * Pickup games award no Points and create no group record; players can opt to form a group after the game if they want rewards.
 * Parameters: none.
 * Returns: a scrollable form with player name inputs, an Add Player button, and a Start Game button.
 * Edge cases: Start Game is disabled when fewer than 2 players are present; Add Player is hidden at 8 players; remove button hidden when only 2 players remain.
 */
export default function PickupSetup() {
  const router = useRouter();
  const nextId = useRef(3);

  const [players, setPlayers] = useState([
    { id: 1, name: 'Player 1' },
    { id: 2, name: 'Player 2' },
  ]);

  const addPlayer = () => {
    if (players.length >= 8) return;
    Haptics.selectionAsync();
    const id = nextId.current++;
    setPlayers((prev) => [...prev, { id, name: `Player ${prev.length + 1}` }]);
  };

  const removePlayer = (id: number) => {
    if (players.length <= 2) return;
    Haptics.selectionAsync();
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const updateName = (id: number, name: string) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  };

  const handleStartGame = () => {
    const valid = players.filter((p) => p.name.trim().length > 0);
    if (valid.length < 2) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({
      pathname: '/life-counter',
      params: { playerNames: valid.map((p) => p.name.trim()).join(',') },
    });
  };

  const canStart = players.filter((p) => p.name.trim().length > 0).length >= 2;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Pickup Game</Text>
      <Text style={styles.subtitle}>
        Jump straight into a game — no group needed.{'\n'}
        Add 2–8 players to start.
      </Text>

      <View style={styles.playerList}>
        {players.map((player, index) => (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerNum}>
              <Text style={styles.playerNumText}>{index + 1}</Text>
            </View>
            <TextInput
              style={styles.nameInput}
              value={player.name}
              onChangeText={(text) => updateName(player.id, text)}
              placeholder={`Player ${index + 1}`}
              placeholderTextColor="#444"
              maxLength={20}
              returnKeyType="next"
            />
            {players.length > 2 && (
              <Pressable
                style={styles.removeBtn}
                onPress={() => removePlayer(player.id)}
              >
                <Text style={styles.removeBtnText}>×</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>

      {players.length < 8 && (
        <Pressable style={styles.addBtn} onPress={addPlayer}>
          <Text style={styles.addBtnText}>+ Add Player</Text>
        </Pressable>
      )}

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Pickup games don't award Points or create a group record. After playing you can form a
          group to earn rewards on future games.
        </Text>
      </View>

      <Pressable
        style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
        onPress={handleStartGame}
        disabled={!canStart}
      >
        <Text style={styles.startBtnText}>Start Game</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 50,
  },
  backBtn: {
    marginBottom: 24,
  },
  backBtnText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 28,
  },
  playerList: {
    gap: 10,
    marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1C1C28',
    borderWidth: 1,
    borderColor: '#2C2C3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#1C1C24',
    borderWidth: 1,
    borderColor: '#2C2C38',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A1010',
    borderWidth: 1,
    borderColor: '#5A2020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 18,
    color: '#C0605A',
    lineHeight: 20,
  },
  addBtn: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2C2C38',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 24,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },
  notice: {
    backgroundColor: '#0A1020',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1A2A40',
    marginBottom: 28,
  },
  noticeText: {
    fontSize: 13,
    color: '#4A6A8A',
    lineHeight: 20,
  },
  startBtn: {
    backgroundColor: '#34C759',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnDisabled: {
    backgroundColor: '#1C2C1C',
    borderWidth: 1,
    borderColor: '#2C3C2C',
  },
  startBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
